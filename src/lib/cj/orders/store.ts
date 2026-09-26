import 'server-only';
import { prisma } from '@/lib/prisma';
import { canTransition, isStatus, mapCjStatus, type OrderStatus } from './state';

/**
 * طبقة تخزين طلبات CJ داخل تربح — سجلّات داخلية فقط (لا اتصال بـ CJ ولا شراء حقيقي).
 * كل الكتابات محميّة بالتفرّد: internal_ref يمنع تكرار الطلب، وevent_key يجعل استقبال
 * الأحداث/الـwebhooks idempotent. الانتقالات تُتحقّق عبر آلة الحالات قبل الحفظ.
 * إرسال الطلب فعلياً إلى CJ خطوة منفصلة ومقفلة (تُبنى لاحقاً خلف حارسي الشراء).
 */

/** بند طلب لإرساله للمورد لاحقاً — CJ يحتاج vid + الكمية (لا الـPID). */
export type OrderLine = { vid: string; quantity: number; sku?: string; logisticName?: string };

export type CreateOrderInput = {
  internalRef: string;
  userId?: number | bigint | null;
  cjProductId?: string;
  productName?: string;
  itemsTotalMinor?: number;
  shippingTotalMinor?: number;
  taxTotalMinor?: number;
  grandTotalMinor?: number;
  currency?: string;
  lines?: OrderLine[];
  ship?: Partial<{ name: string; phone: string; country: string; region: string; city: string; address1: string; address2: string; zip: string }>;
};

/** يُطهّر بنود الطلب قبل التخزين (vid والكمية إلزاميان؛ حدود واضحة). */
export function sanitizeOrderLines(value: unknown): OrderLine[] {
  if (!Array.isArray(value)) return [];
  const out: OrderLine[] = [];
  for (const raw of value.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const vid = String(r.vid ?? '').trim().slice(0, 64);
    const quantity = Math.trunc(Number(r.quantity));
    if (!vid || !Number.isFinite(quantity) || quantity < 1 || quantity > 999) continue;
    const line: OrderLine = { vid, quantity };
    const sku = String(r.sku ?? '').trim().slice(0, 191);
    const logisticName = String(r.logisticName ?? '').trim().slice(0, 120);
    if (sku) line.sku = sku;
    if (logisticName) line.logisticName = logisticName;
    out.push(line);
  }
  return out;
}

/** يقرأ بنود الطلب المخزَّنة (JSON) بأمان. */
export function parseOrderLines(json: string | null | undefined): OrderLine[] {
  if (!json) return [];
  try { return sanitizeOrderLines(JSON.parse(json)); } catch { return []; }
}

export type EventInput = {
  eventKey: string;
  type?: string;
  source?: 'internal' | 'cj' | 'carrier' | 'system';
  fromStatus?: string;
  toStatus?: string;
  note?: string;
  actorId?: number | bigint | null;
};

const bid = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(v));

/** يضيف حدثاً للطلب (idempotent عبر event_key). يعيد هل أُدرج فعلاً. */
export async function appendOrderEvent(orderId: number | bigint, e: EventInput): Promise<boolean> {
  const r = await prisma.cj_order_events.createMany({
    data: [{
      order_id: bid(orderId), event_key: e.eventKey.slice(0, 191), type: (e.type ?? 'note').slice(0, 48),
      source: e.source ?? 'internal', from_status: (e.fromStatus ?? '').slice(0, 32), to_status: (e.toStatus ?? '').slice(0, 32),
      note: (e.note ?? '').slice(0, 1000), actor_id: e.actorId == null ? null : bid(e.actorId),
    }],
    skipDuplicates: true,
  }).catch(() => ({ count: 0 }));
  return r.count > 0;
}

/** ينشئ طلباً (idempotent عبر internal_ref). يعيد المعرّف وهل أُنشئ الآن. */
export async function createOrder(input: CreateOrderInput, actorId?: number): Promise<{ id: bigint; created: boolean }> {
  const ref = input.internalRef.trim().slice(0, 64);
  if (!ref) throw new Error('internal_ref_required');
  const existing = await prisma.cj_orders.findUnique({ where: { internal_ref: ref }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  try {
    const row = await prisma.cj_orders.create({
      data: {
        internal_ref: ref,
        user_id: input.userId == null ? null : bid(input.userId),
        cj_product_id: (input.cjProductId ?? '').slice(0, 64),
        product_name: (input.productName ?? '').slice(0, 400),
        cj_lines_json: input.lines?.length ? JSON.stringify(sanitizeOrderLines(input.lines)) : null,
        items_total_minor: input.itemsTotalMinor ?? 0,
        shipping_total_minor: input.shippingTotalMinor ?? 0,
        tax_total_minor: input.taxTotalMinor ?? 0,
        grand_total_minor: input.grandTotalMinor ?? 0,
        currency: (input.currency ?? 'SAR').slice(0, 3),
        ship_name: (input.ship?.name ?? '').slice(0, 160),
        ship_phone: (input.ship?.phone ?? '').slice(0, 40),
        ship_country: (input.ship?.country ?? 'SA').slice(0, 4),
        ship_region: (input.ship?.region ?? '').slice(0, 120),
        ship_city: (input.ship?.city ?? '').slice(0, 120),
        ship_address1: (input.ship?.address1 ?? '').slice(0, 400),
        ship_address2: (input.ship?.address2 ?? '').slice(0, 400),
        ship_zip: (input.ship?.zip ?? '').slice(0, 20),
      },
      select: { id: true },
    });
    await appendOrderEvent(row.id, { eventKey: `${ref}:created`, type: 'created', note: 'إنشاء الطلب', actorId });
    return { id: row.id, created: true };
  } catch {
    // سباق إنشاء متزامن على نفس المرجع — أعد الجلب.
    const again = await prisma.cj_orders.findUnique({ where: { internal_ref: ref }, select: { id: true } });
    if (again) return { id: again.id, created: false };
    throw new Error('create_order_failed');
  }
}

export async function getOrderById(id: number | bigint) {
  return prisma.cj_orders.findUnique({ where: { id: bid(id) } }).catch(() => null);
}
export async function getOrderByRef(ref: string) {
  return prisma.cj_orders.findUnique({ where: { internal_ref: ref.trim().slice(0, 64) } }).catch(() => null);
}
export async function listOrderEvents(orderId: number | bigint) {
  return prisma.cj_order_events.findMany({ where: { order_id: bid(orderId) }, orderBy: { id: 'asc' } }).catch(() => []);
}
/** عدد الطلبات لكل حالة (للوحة المراقبة). */
export async function countOrdersByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.cj_orders.groupBy({ by: ['status'], _count: { status: true } }).catch(() => [] as { status: string; _count: { status: number } }[]);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count.status;
  return out;
}

export async function listOrders(opts: { status?: string; limit?: number; offset?: number } = {}) {
  const take = Math.min(Math.max(1, opts.limit ?? 50), 200);
  return prisma.cj_orders.findMany({
    where: opts.status && isStatus(opts.status) ? { status: opts.status } : undefined,
    orderBy: { id: 'desc' }, take, skip: Math.max(0, opts.offset ?? 0),
  }).catch(() => []);
}

export type TransitionResult = { ok: true; from: OrderStatus; to: OrderStatus } | { ok: false; error: string };

/** ينقل حالة الطلب بعد التحقق من آلة الحالات، ويسجّل الحدث. idempotent عند تمرير eventKey. */
export async function transitionOrder(
  orderId: number | bigint,
  to: string,
  opts: { reason?: string; actorId?: number | bigint | null; source?: EventInput['source']; eventKey?: string } = {},
): Promise<TransitionResult> {
  if (!isStatus(to)) return { ok: false, error: 'unknown_status' };
  const order = await getOrderById(orderId);
  if (!order) return { ok: false, error: 'not_found' };
  const from = order.status;
  if (!isStatus(from)) return { ok: false, error: 'corrupt_status' };
  if (from === to) return { ok: true, from, to }; // لا عملية، لكن ليست خطأ
  if (!canTransition(from, to)) return { ok: false, error: 'invalid_transition' };

  const now = new Date();
  await prisma.cj_orders.update({
    where: { id: bid(orderId) },
    data: {
      status: to, status_reason: (opts.reason ?? '').slice(0, 300),
      ...(to === 'sent_to_cj' && !order.placed_at ? { placed_at: now } : {}),
      ...(to === 'delivered' && !order.delivered_at ? { delivered_at: now } : {}),
    },
  }).catch(() => {});
  await appendOrderEvent(orderId, {
    eventKey: opts.eventKey ?? `${order.internal_ref}:${to}:${now.getTime()}`,
    type: 'status_change', source: opts.source ?? 'internal', fromStatus: from, toStatus: to,
    note: opts.reason ?? '', actorId: opts.actorId ?? null,
  });
  return { ok: true, from, to };
}

/** يحدّث بيانات التتبّع ويسجّل حدثاً (idempotent عبر eventKey إن مُرّر). */
export async function setOrderTracking(
  orderId: number | bigint,
  t: { carrier?: string; trackingNumber?: string; trackingUrl?: string; trackingStatus?: string; cjOrderId?: string },
  opts: { eventKey?: string; source?: EventInput['source']; actorId?: number } = {},
): Promise<void> {
  await prisma.cj_orders.update({
    where: { id: bid(orderId) },
    data: {
      ...(t.carrier !== undefined ? { carrier: t.carrier.slice(0, 120) } : {}),
      ...(t.trackingNumber !== undefined ? { tracking_number: t.trackingNumber.slice(0, 160) } : {}),
      ...(t.trackingUrl !== undefined ? { tracking_url: t.trackingUrl.slice(0, 1024) } : {}),
      ...(t.trackingStatus !== undefined ? { tracking_status: t.trackingStatus.slice(0, 64) } : {}),
      ...(t.cjOrderId !== undefined ? { cj_order_id: t.cjOrderId.slice(0, 64) } : {}),
    },
  }).catch(() => {});
  await appendOrderEvent(orderId, { eventKey: opts.eventKey ?? `${String(orderId)}:track:${Date.now()}`, type: 'tracking', source: opts.source ?? 'carrier', note: t.trackingStatus ?? '', actorId: opts.actorId });
}

/**
 * يطبّق حالة CJ خام على الطلب: يربطها لرمز داخلي ثم ينتقل إن كان الانتقال صالحاً.
 * idempotent عبر eventKey. الحالة المجهولة لا تُفترض — تُسجَّل كحدث ويُعلَّم الطلب
 * «يحتاج تدخّلاً» إن لم تُعرف، لِيُراجَع يدوياً (لا قرار آلي بلا معرفة).
 */
export async function applyCjStatus(
  orderId: number | bigint,
  rawStatus: string,
  opts: { eventKey: string; note?: string } = { eventKey: '' },
): Promise<{ ok: boolean; mapped: string | null }> {
  const mapped = mapCjStatus(rawStatus);
  if (!mapped) {
    await appendOrderEvent(orderId, { eventKey: opts.eventKey || `${String(orderId)}:cjunknown:${Date.now()}`, type: 'cj_status_unknown', source: 'cj', note: `حالة CJ غير معروفة: ${rawStatus}` });
    return { ok: false, mapped: null };
  }
  const r = await transitionOrder(orderId, mapped, { source: 'cj', eventKey: opts.eventKey, reason: opts.note ?? `مزامنة حالة CJ: ${rawStatus}` });
  return { ok: r.ok, mapped };
}
