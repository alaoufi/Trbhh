import 'server-only';
import { prisma } from '@/lib/prisma';
import { getCjOrderDetail, getTracking } from '../client';
import { applyCjStatus, setOrderTracking } from './store';

/**
 * مزامنة حالة طلبات CJ — عبر الـwebhook (دفع فوري) وعبر الاستطلاع الدوري (شبكة أمان).
 * الاثنان idempotent: نفس الحدث لا يُطبَّق مرتين (event_key في الأحداث، وقفزات آلة
 * الحالات للأمام فقط). لا يمسّ هذا الملف المال إطلاقاً — تحديث حالة/تتبّع فقط.
 */

/** استخراج حقول الحالة من حمولة webhook الخام (أسماء CJ تختلف — best-effort). */
export function extractCjStatusEvent(payload: Record<string, unknown>): {
  cjOrderId: string; orderNumber: string; rawStatus: string; trackNumber: string;
} {
  const data = payload?.params&&typeof payload.params==='object'?payload.params as Record<string,unknown>:(payload && typeof payload.data === 'object' && payload.data) ? payload.data as Record<string, unknown> : payload;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = data?.[k] ?? payload?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return '';
  };
  return {
    cjOrderId: pick('orderId', 'cjOrderId', 'orderNum').slice(0, 64),
    orderNumber: pick('orderNumber', 'orderNum').slice(0, 64),
    rawStatus: pick('orderStatus', 'status', 'logisticStatus', 'trackStatus').slice(0, 64),
    trackNumber: pick('trackNumber', 'trackingNumber').slice(0, 160),
  };
}

/** يبحث عن طلب داخلي مطابق لحدث CJ (بمعرّف CJ أو برقمنا internal_ref). */
async function findOrderForEvent(cjOrderId: string, orderNumber: string) {
  if (cjOrderId) {
    const byCj = await prisma.cj_orders.findFirst({ where: { cj_order_id: cjOrderId }, select: { id: true, internal_ref: true, cj_order_id: true, status: true } }).catch(() => null);
    // A conflicting identity must never fall back to a coincidentally equal reference.
    return byCj && (!orderNumber || byCj.internal_ref === orderNumber) ? byCj : null;
  }
  if (orderNumber) {
    const byRef = await prisma.cj_orders.findUnique({ where: { internal_ref: orderNumber }, select: { id: true, internal_ref: true, cj_order_id: true, status: true } }).catch(() => null);
    if (byRef) return byRef;
  }
  return null;
}

async function verifiedLegacyDetail(order: {cj_order_id: string; internal_ref: string}) {
  if (!order.cj_order_id) return null;
  const detail = await getCjOrderDetail(order.cj_order_id).catch(() => null);
  if (!detail?.ok) return null;
  const proof = detail.data.proof;
  // Absence of sandbox classification is not affirmative evidence of a live order.
  if (!proof || (proof.isSandbox !== 0 && proof.isSandbox !== '0' && proof.isSandbox !== false) ||
      proof.orderId !== order.cj_order_id || proof.orderNum !== order.internal_ref) return null;
  return {
    orderStatus: typeof proof.orderStatus === 'string' ? proof.orderStatus : '',
    trackNumber: typeof proof.trackNumber === 'string' ? proof.trackNumber : '',
  };
}

/**
 * يطبّق حدث webhook مخزَّناً على طلبه: يربط الحالة الخام لرمز داخلي وينقل الحالة
 * (idempotent)، ويحدّث رقم التتبّع إن وُجد. يعيد هل عولج فعلاً.
 */
export async function applyCjWebhookEvent(ev: {
  eventKey: string; cjOrderId: string; orderNumber: string; rawStatus: string; trackNumber: string;
}): Promise<{ applied: boolean; matched: boolean }> {
  const order = await findOrderForEvent(ev.cjOrderId, ev.orderNumber);
  if (!order) return { applied: false, matched: false };
  const detail = await verifiedLegacyDetail(order);
  if (!detail) return { applied: false, matched: false };
  let applied = false;
  if (detail.orderStatus) {
    const r = await applyCjStatus(order.id, detail.orderStatus, { eventKey: `${ev.eventKey}:status` });
    applied = r.ok;
  }
  if (detail.trackNumber) {
    await setOrderTracking(order.id, { trackingNumber: detail.trackNumber, trackingStatus: detail.orderStatus || undefined }, { source: 'cj', eventKey: `${ev.eventKey}:track` });
    applied = true;
  }
  return { applied, matched: true };
}

/** معالجة دفعة من أحداث webhook غير المعالَجة (للاستدعاء من الـwebhook أو كرون). */
export async function processPendingWebhookEvents(limit = 50): Promise<{ processed: number; matched: number }> {
  const rows = await prisma.cj_webhook_events.findMany({
    where: { processed: 0 }, orderBy: { id: 'asc' }, take: Math.min(Math.max(1, limit), 200),
  }).catch(() => [] as { id: bigint; event_key: string; cj_order_id: string; order_number: string; raw_status: string; track_number: string }[]);
  let processed = 0, matched = 0;
  for (const row of rows) {
    const r = await applyCjWebhookEvent({
      eventKey: row.event_key, cjOrderId: row.cj_order_id, orderNumber: row.order_number,
      rawStatus: row.raw_status, trackNumber: row.track_number,
    });
    if (r.matched) matched++;
    // نعلّم الحدث معالَجاً متى طُوبِق الطلب (حتى لو لم ينتج انتقال — لتفادي إعادة المحاولة بلا جدوى).
    if (r.matched) {
      await prisma.cj_webhook_events.update({ where: { id: row.id }, data: { processed: 1 } }).catch(() => {});
      processed++;
    }
  }
  return { processed, matched };
}

/**
 * الاستطلاع الدوري (شبكة أمان للـwebhook): يستعلم عن حالة/تتبّع الطلبات المفتوحة من CJ
 * ويطبّقها. يقتصر على الطلبات التي لها cj_order_id وليست في حالة نهائية. آمن ماليّاً.
 */
export async function pollOpenCjOrders(limit = 25): Promise<{ polled: number; updated: number }> {
  const open = await prisma.cj_orders.findMany({
    where: {
      cj_order_id: { not: '' },
      status: { notIn: ['completed', 'cancelled', 'refunded', 'awaiting_payment', 'awaiting_approval'] },
    },
    orderBy: [{ last_polled_at: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: Math.min(Math.max(1, limit), 100),
    select: { id: true, internal_ref: true, cj_order_id: true },
  }).catch(() => [] as { id: bigint; internal_ref: string; cj_order_id: string }[]);

  let polled = 0, updated = 0;
  for (const order of open) {
    polled++;
    const detail = await verifiedLegacyDetail(order);
    const stamp = Date.now();
    if (detail) {
      if (detail.orderStatus) {
        const r = await applyCjStatus(order.id, detail.orderStatus, { eventKey: `${order.internal_ref}:poll:${detail.orderStatus}:${new Date().toISOString().slice(0, 13)}` });
        if (r.ok) updated++;
      }
      const track = detail.trackNumber;
      if (track) {
        const t = await getTracking(track).catch(() => null);
        await setOrderTracking(order.id, {
          trackingNumber: track,
          trackingStatus: t?.ok ? (t.data.trackStatus ?? undefined) : undefined,
          carrier: t?.ok ? (t.data.logisticName ?? undefined) : undefined,
        }, { source: 'carrier', eventKey: `${order.internal_ref}:polltrack:${stamp}` });
      }
    }
    await prisma.cj_orders.update({ where: { id: order.id }, data: { last_polled_at: new Date() } }).catch(() => {});
  }
  return { polled, updated };
}
