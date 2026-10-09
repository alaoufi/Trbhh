import 'server-only';
import { prisma } from '@/lib/prisma';
import { getSettingNum } from '@/lib/settings';
import { createCjOrder, payCjOrderBalance, getCjBalance } from '../client';
import { buildCjOrderPayload } from './dispatch';
import { getOrderById, parseOrderLines, transitionOrder, appendOrderEvent } from './store';
import { recordLedgerEntry } from './ledger';

/**
 * مُنسّق الدفع من محفظة CJ بعد موافقة الإدارة — الطبقة المالية الحسّاسة.
 *
 * التسلسل الآمن (أمور مالية):
 *  1) حارس التكرار: لو الطلب مدفوع مسبقاً (paid_at) لا يُعاد الدفع إطلاقاً (idempotent).
 *  2) إنشاء الطلب لدى CJ بـ payType=3 (إنشاء بلا خصم) — آمن ماليّاً، يعيد المبلغ الفعلي.
 *     لو كان cj_order_id موجوداً نُعيد استخدامه ولا نُنشئ طلباً ثانياً (منع ازدواج الطلب).
 *  3) التحقق من المبلغ: المبلغ الفعلي من CJ هو مصدر الحقيقة. غيابه يمنع الدفع
 *     («السعر/الشحن غير المتحقق منه يمنع إتمام الشراء»).
 *  4) السقف: لو تجاوز المبلغ الفعلي السقف المعتمَد يُمنع الخصم ويُعلَّم الطلب «يحتاج تدخّلاً».
 *  5) الدفع عبر payBalance/payBalanceV2 مع payId ثابت (منع ازدواج الخصم عند CJ).
 *  6) عند النجاح: تثبيت الحالة paid + قيد محاسبي واحد (idempotent) + ختم وقت الدفع.
 *
 * كل ذلك محجوب أصلاً بحارسَي الشراء داخل createCjOrder/payCjOrderBalance (مفتاح الشراء
 * المركزي + SUPPLIER_ALLOW_LIVE_ORDERS)، فلا خصم حقيقي قبل التفعيل اليدوي من الإدارة.
 */

export type ApproveAndPayResult =
  | { ok: true; cjOrderId: string; actualPaymentUsdMinor: number; alreadyPaid?: boolean }
  | { ok: false; reason: 'not_found' | 'blocked' | 'no_lines' | 'already_paid' | 'pay_in_progress' | 'cj_create_error' | 'no_amount' | 'over_cap' | 'insufficient_balance' | 'pay_error'; detail?: string; actualPaymentUsdMinor?: number; capUsdMinor?: number; balanceUsdMinor?: number };

/** السقف المعتمَد للطلب الواحد بالدولار (minor). إعداد لوحة الإدارة cj_order_cap_usd. */
export async function cjOrderCapUsdMinor(): Promise<number> {
  const dollars = await getSettingNum('cj_order_cap_usd', 50).catch(() => 50);
  const minor = Math.round((Number.isFinite(dollars) && dollars > 0 ? dollars : 50) * 100);
  return minor;
}

const bid = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(v));
const usdMinor = (usd: number) => Math.round(usd * 100);

/**
 * يعتمد الطلب ويدفعه من محفظة CJ. capUsdMinor الصريح يَغلِب الإعداد العام (للتجارب
 * الإدارية بسقف أدنى). actorId = المسؤول المعتمِد (يُختم على الطلب).
 */
export async function approveAndPayOrder(
  orderId: number | bigint,
  opts: { actorId?: number; capUsdMinor?: number } = {},
): Promise<ApproveAndPayResult> {
  const order = await getOrderById(orderId);
  if (!order) return { ok: false, reason: 'not_found' };

  // (1) حارس التكرار — لا دفع مزدوج أبداً.
  if (order.paid_at) {
    return { ok: true, cjOrderId: order.cj_order_id || '', actualPaymentUsdMinor: order.actual_payment_usd_minor ?? 0, alreadyPaid: true };
  }

  const lines = parseOrderLines(order.cj_lines_json);
  if (!lines.length) {
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:nolines`, type: 'cj_pay_failed', source: 'system', note: 'لا توجد بنود للطلب — تعذّر الدفع' });
    return { ok: false, reason: 'no_lines' };
  }

  const cap = opts.capUsdMinor != null && opts.capUsdMinor > 0 ? opts.capUsdMinor : await cjOrderCapUsdMinor();

  // قفل دفع متفائل ذرّي: نطالب بالطلب للدفع عبر تحديث مشروط (pay_started_at=null و paid_at=null).
  // لو فشلت المطالبة (count=0) فهناك محاولة دفع متزامنة قائمة أو الطلب مدفوع — نتوقّف فوراً
  // دون أي إنشاء أو خصم (يمنع double-pay عند الضغط المتكرر أو طلبين متزامنين).
  const claim = await prisma.cj_orders.updateMany({
    where: { id: bid(orderId), pay_started_at: null, paid_at: null },
    data: { pay_started_at: new Date() },
  }).catch(() => ({ count: 0 }));
  if (claim.count === 0) {
    const fresh = await getOrderById(orderId);
    if (fresh?.paid_at) return { ok: true, cjOrderId: fresh.cj_order_id || '', actualPaymentUsdMinor: fresh.actual_payment_usd_minor ?? 0, alreadyPaid: true };
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:locked:${Date.now()}`, type: 'cj_pay_blocked', source: 'system', note: 'محاولة دفع متزامنة قائمة — مُنع الخصم المكرّر', actorId: opts.actorId });
    return { ok: false, reason: 'pay_in_progress' };
  }
  // نضمن تحرير القفل عند أي خروج غير ناجح (الفشل يسمح بإعادة محاولة لاحقة).
  const release = async () => { await prisma.cj_orders.updateMany({ where: { id: bid(orderId), paid_at: null }, data: { pay_started_at: null } }).catch(() => {}); };

  // (2) إنشاء الطلب لدى CJ (payType=3) أو إعادة استخدام القائم — دون أي خصم.
  let cjOrderId = order.cj_order_id || '';
  let shipmentOrderId = order.cj_shipment_order_id || '';
  let actualMinor = order.actual_payment_usd_minor ?? 0;

  if (!cjOrderId) {
    const payload = buildCjOrderPayload(order, lines);
    const created = await createCjOrder(payload as unknown as Record<string, unknown>);
    if (!created.ok) {
      if (created.error === 'cj_purchasing_disabled') {
        await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:blocked`, type: 'cj_pay_blocked', source: 'system', note: 'الشراء الحيّ غير مفعّل — الطلب معتمَد بانتظار التفعيل اليدوي', actorId: opts.actorId });
        await transitionOrder(orderId, 'awaiting_approval', { source: 'internal', actorId: opts.actorId, reason: 'اعتمده المسؤول — بانتظار تفعيل الشراء الحيّ' }).catch(() => {});
        await release();
        return { ok: false, reason: 'blocked' };
      }
      await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:createerr:${Date.now()}`, type: 'cj_pay_failed', source: 'cj', note: `تعذّر إنشاء الطلب لدى CJ: ${created.error}`, actorId: opts.actorId });
      await transitionOrder(orderId, 'needs_action', { source: 'system', actorId: opts.actorId, reason: `فشل إنشاء الطلب لدى CJ: ${created.error}` }).catch(() => {});
      await release();
      return { ok: false, reason: 'cj_create_error', detail: created.error };
    }
    cjOrderId = created.data.orderId;
    shipmentOrderId = created.data.shipmentOrderId || '';
    actualMinor = created.data.actualPaymentUsd != null ? usdMinor(created.data.actualPaymentUsd) : 0;
    await prisma.cj_orders.update({
      where: { id: bid(orderId) },
      data: {
        cj_order_id: cjOrderId.slice(0, 64),
        cj_shipment_order_id: shipmentOrderId.slice(0, 64),
        actual_payment_usd_minor: actualMinor,
        verified_at: new Date(),
        verified_source: 'cj_createOrderV2',
      },
    }).catch(() => {});
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:cj:created`, type: 'cj_order_created', source: 'cj', note: `أُنشئ الطلب لدى CJ (${cjOrderId}) — المبلغ الفعلي $${(actualMinor / 100).toFixed(2)}`, actorId: opts.actorId });
  }

  // (3) التحقق من وجود مبلغ فعلي — غيابه يمنع الدفع (لا دفع بمبلغ غير متحقق منه).
  if (!actualMinor || actualMinor <= 0) {
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:noamount`, type: 'cj_pay_blocked', source: 'system', note: 'لم يُعِد CJ مبلغاً فعلياً للطلب — مُنع الدفع حتى التحقق', actorId: opts.actorId });
    await transitionOrder(orderId, 'needs_action', { source: 'system', actorId: opts.actorId, reason: 'المبلغ الفعلي من CJ غير متوفّر — تحقّق يدوي' }).catch(() => {});
    await release();
    return { ok: false, reason: 'no_amount', actualPaymentUsdMinor: actualMinor };
  }

  // (4) السقف المعتمَد — تجاوزه يمنع الخصم نهائياً.
  if (actualMinor > cap) {
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:overcap`, type: 'cj_pay_blocked', source: 'system', note: `المبلغ الفعلي $${(actualMinor / 100).toFixed(2)} تجاوز السقف المعتمَد $${(cap / 100).toFixed(2)} — مُنع الخصم`, actorId: opts.actorId });
    await transitionOrder(orderId, 'needs_action', { source: 'system', actorId: opts.actorId, reason: `المبلغ تجاوز السقف ($${(actualMinor / 100).toFixed(2)} > $${(cap / 100).toFixed(2)})` }).catch(() => {});
    await release();
    return { ok: false, reason: 'over_cap', actualPaymentUsdMinor: actualMinor, capUsdMinor: cap };
  }

  // (4.5) فحص الرصيد قبل أي محاولة خصم: لو رصيد محفظة CJ أقل من المبلغ المستحق لا نحاول
  // الدفع إطلاقاً — نُبقي الطلب كما هو ليشحن المسؤول المحفظة ثم يعيد المحاولة على نفس الطلب.
  const bal = await getCjBalance().catch(() => null);
  if (bal?.ok && Math.round(bal.data.amountUsd * 100) < actualMinor) {
    const balanceUsdMinor = Math.round(bal.data.amountUsd * 100);
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:lowbalance:${Date.now()}`, type: 'cj_pay_blocked', source: 'system', note: `رصيد المحفظة $${(balanceUsdMinor / 100).toFixed(2)} أقل من المستحق $${(actualMinor / 100).toFixed(2)} — مُنع الخصم. اشحن المحفظة ثم أعد المحاولة.`, actorId: opts.actorId });
    await release();
    return { ok: false, reason: 'insufficient_balance', actualPaymentUsdMinor: actualMinor, balanceUsdMinor };
  }

  // (5) الدفع — payId ثابت مشتقّ من مرجعنا يمنع ازدواج الخصم لدى CJ.
  const payId = `TRB-${order.internal_ref}`.slice(0, 64);
  const pay = await payCjOrderBalance({ orderId: cjOrderId, shipmentOrderId: shipmentOrderId || undefined, payId });
  if (!pay.ok) {
    if (pay.error === 'cj_purchasing_disabled') {
      await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:blocked2`, type: 'cj_pay_blocked', source: 'system', note: 'الشراء الحيّ غير مفعّل عند الدفع', actorId: opts.actorId });
      await release();
      return { ok: false, reason: 'blocked' };
    }
    await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:err:${Date.now()}`, type: 'cj_pay_failed', source: 'cj', note: `تعذّر الدفع من محفظة CJ: ${pay.error}`, actorId: opts.actorId });
    await transitionOrder(orderId, 'needs_action', { source: 'system', actorId: opts.actorId, reason: `فشل الدفع: ${pay.error}` }).catch(() => {});
    await release();
    return { ok: false, reason: 'pay_error', detail: pay.error, actualPaymentUsdMinor: actualMinor };
  }

  // (6) نجاح الدفع — تثبيت الحالة والوقت والمعتمِد + قيد محاسبي idempotent.
  const now = new Date();
  await prisma.cj_orders.update({
    where: { id: bid(orderId) },
    data: {
      cj_pay_id: payId,
      paid_at: now,
      approved_at: order.approved_at ?? now,
      approved_by: opts.actorId == null ? order.approved_by : bid(opts.actorId),
      approved_cap_usd_minor: cap,
      placed_at: order.placed_at ?? now,
    },
  }).catch(() => {});
  await transitionOrder(orderId, 'paid', { source: 'internal', actorId: opts.actorId, reason: `دُفع من محفظة CJ ($${(actualMinor / 100).toFixed(2)})`, eventKey: `${order.internal_ref}:paid` });
  await recordLedgerEntry({
    entryKey: `${order.internal_ref}:charge`,
    orderId,
    entryType: 'charge',
    amountUsdMinor: actualMinor,
    cjRef: cjOrderId,
    source: 'cj',
    note: `خصم شراء طلب ${order.internal_ref} من محفظة CJ`,
  });
  await appendOrderEvent(orderId, { eventKey: `${order.internal_ref}:pay:ok`, type: 'cj_paid', source: 'cj', note: `تمّ الدفع من محفظة CJ — $${(actualMinor / 100).toFixed(2)}`, actorId: opts.actorId });
  return { ok: true, cjOrderId, actualPaymentUsdMinor: actualMinor };
}
