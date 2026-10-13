import 'server-only';
import { getSettingNum } from '@/lib/settings';
import { getOrderById, appendOrderEvent } from './store';

// P0 blockade: no verified atomic amount-bound debit, payment reconciliation,
// supplier acceptance or inventory reservation contract is available yet.
// Customer payment and legacy paid_at flags are not supplier purchase evidence.
export type ApproveAndPayResult =
  | { ok: true; cjOrderId: string; actualPaymentUsdMinor: number; alreadyPaid?: boolean }
  | { ok: false; reason: 'purchase_unverified' | 'not_found' | 'blocked' | 'no_lines' | 'already_paid' | 'pay_in_progress' | 'cj_create_error' | 'no_amount' | 'over_cap' | 'insufficient_balance' | 'pay_error'; detail?: string; actualPaymentUsdMinor?: number; capUsdMinor?: number; balanceUsdMinor?: number };

/** السقف المعتمَد للطلب الواحد بالدولار (minor). إعداد لوحة الإدارة cj_order_cap_usd. */
export async function cjOrderCapUsdMinor(): Promise<number> {
  const dollars = await getSettingNum('cj_order_cap_usd', 50).catch(() => 50);
  const minor = Math.round((Number.isFinite(dollars) && dollars > 0 ? dollars : 50) * 100);
  return minor;
}

/** Returns a recorded P0 blockade; never treats customer payment as CJ purchase proof. */
export async function approveAndPayOrder(
  orderId: number | bigint,
  opts: { actorId?: number; capUsdMinor?: number } = {},
): Promise<ApproveAndPayResult> {
  const order = await getOrderById(orderId);
  if (!order) return { ok: false, reason: 'not_found' };
  await appendOrderEvent(orderId, {
    eventKey: `${order.internal_ref}:purchase:commitment-unverified`,
    type: 'cj_purchase_p0_blocked', source: 'system', actorId: opts.actorId,
    note: 'P0: أوقف الشراء والخصم. لا يوجد ضمان موثق لحد المبلغ عند الخصم أو منع تكراره، ولا دليل قبول CJ وتخصيص المخزون. يلزم فحص الإدارة ومطابقة CJ؛ لم ينفذ أي اتصال مالي.',
  });
  return { ok: false, reason: 'purchase_unverified', detail: 'cj_purchase_commitment_unverified' };
}
