import 'server-only';
import { createCjOrder } from '../client';
import { getOrderById, parseOrderLines, transitionOrder, setOrderTracking, appendOrderEvent, type OrderLine } from './store';

/**
 * إرسال الطلب المُكتمَل دفعه إلى المورد (CJ) — «كيف يصل المورد إشعار إتمام الشراء».
 *
 * المبدأ الأمني: الإرسال الفعلي مقفل دائماً خلف حارسي الشراء داخل createCjOrder
 * (مفتاح الشراء المركزي commerce_purchasing_enabled + SUPPLIER_ALLOW_LIVE_ORDERS='true').
 * ما دام أحدهما مغلقاً لا يُجرى أي اتصال شبكي بالمورد ولا يتغيّر شيء ماليّاً — يُسجَّل
 * الطلب فقط أنه «جاهز للإرسال» ويبقى بانتظار التفعيل اليدوي. لا خصم ولا شراء حقيقي هنا.
 *
 * لا يُرسَل الطلب إلا بعد تأكيد الدفع (حالة paid/verifying). قبل ذلك يُرفض الإرسال.
 */

/** أسماء حقول createOrderV2 لدى CJ — محوّل مرن best-effort حتى تأكيد المورد، معزول هنا. */
export type CjOrderPayload = {
  orderNumber: string;
  shippingCountryCode: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingCustomerName: string;
  shippingPhone: string;
  shippingZip: string;
  fromCountryCode: string;
  logisticName: string;
  remark: string;
  products: { vid: string; quantity: number }[];
};

type OrderRow = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;

/** يبني حمولة طلب CJ من سجل الطلب الداخلي وبنوده — دالة نقية قابلة للاختبار. */
export function buildCjOrderPayload(order: {
  internal_ref: string; ship_country: string; ship_region: string; ship_city: string;
  ship_address1: string; ship_address2: string; ship_name: string; ship_phone: string; ship_zip: string;
}, lines: OrderLine[]): CjOrderPayload {
  const address = [order.ship_address1, order.ship_address2].map(s => (s || '').trim()).filter(Boolean).join(' - ');
  const logisticName = lines.find(l => l.logisticName)?.logisticName || '';
  return {
    orderNumber: order.internal_ref,
    shippingCountryCode: (order.ship_country || 'SA').toUpperCase(),
    shippingProvince: order.ship_region || '',
    shippingCity: order.ship_city || '',
    shippingAddress: address,
    shippingCustomerName: order.ship_name || '',
    shippingPhone: order.ship_phone || '',
    shippingZip: order.ship_zip || '',
    fromCountryCode: 'CN',
    logisticName,
    remark: '',
    products: lines.map(l => ({ vid: l.vid, quantity: l.quantity })),
  };
}

/** هل الطلب في حالة تسمح بالإرسال للمورد؟ (بعد تأكيد الدفع، وقبل الإرسال). */
export function canDispatch(status: string): boolean {
  return status === 'paid' || status === 'verifying';
}

export type DispatchResult =
  | { ok: true; cjOrderId: string }
  | { ok: false; reason: 'not_found' | 'not_ready' | 'no_lines' | 'blocked' | 'cj_error'; detail?: string };

/**
 * ينفّذ الإرسال: يتحقّق من الحالة والبنود، يبني الحمولة، ثم يستدعي createCjOrder المقفل.
 * - إن كان الشراء الحيّ معطّلاً (blocked): يسجّل الحدث ولا يغيّر الحالة (آمن افتراضاً).
 * - عند النجاح: يخزّن معرّف طلب المورد وينتقل إلى sent_to_cj.
 * - عند فشل المورد: يسجّل الحدث ويضع الطلب «يحتاج تدخّلاً».
 */
export async function dispatchOrderToCj(orderId: number | bigint, actorId?: number): Promise<DispatchResult> {
  const order = await getOrderById(orderId) as OrderRow | null;
  if (!order) return { ok: false, reason: 'not_found' };
  if (order.cj_order_id) return { ok: true, cjOrderId: order.cj_order_id }; // أُرسل سابقاً — idempotent
  if (!canDispatch(order.status)) return { ok: false, reason: 'not_ready' };

  const lines = parseOrderLines(order.cj_lines_json);
  if (!lines.length) {
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:dispatch:nolines`, type: 'cj_dispatch_failed', source: 'system', note: 'لا توجد بنود قابلة للإرسال للمورد' });
    return { ok: false, reason: 'no_lines' };
  }

  const payload = buildCjOrderPayload(order, lines);
  const res = await createCjOrder(payload);

  if (!res.ok) {
    if (res.error === 'cj_purchasing_disabled') {
      await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:dispatch:blocked`, type: 'cj_dispatch_blocked', source: 'system', note: 'الشراء الحيّ غير مفعّل — الطلب جاهز للإرسال بانتظار التفعيل اليدوي', actorId });
      return { ok: false, reason: 'blocked' };
    }
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:dispatch:err:${Date.now()}`, type: 'cj_dispatch_failed', source: 'cj', note: `تعذّر إرسال الطلب للمورد: ${res.error}`, actorId });
    await transitionOrder(orderId, 'needs_action', { source: 'system', actorId, reason: `فشل إرسال الطلب للمورد: ${res.error}` });
    return { ok: false, reason: 'cj_error', detail: res.error };
  }

  const cjOrderId = res.data.orderId;
  await setOrderTracking(orderId, { cjOrderId }, { source: 'cj', actorId, eventKey: `${order.internal_ref}:dispatch:cjid` });
  await transitionOrder(orderId, 'sent_to_cj', { source: 'internal', actorId, reason: 'أُرسل الطلب إلى المورد', eventKey: `${order.internal_ref}:dispatch:sent` });
  await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:dispatch:ok`, type: 'cj_dispatch_sent', source: 'cj', note: `معرّف طلب المورد: ${cjOrderId}`, actorId });
  return { ok: true, cjOrderId };
}
