import 'server-only';
import type { CommerceDb, PaymentAttempt, NotificationTarget } from './types';
import type { CommerceGateway } from './gateway';
import { paymentMatches, settleVerifiedPayment } from './orders';

/** Authenticated callers supply only an owned order id, never purported bank
 * payment fields. Verification is independent of checkout being enabled: an
 * already-created bank transaction still needs reconciliation after a shutdown.
 */
export async function reconcileCommerceOrder(db: CommerceDb, input: { memberId: bigint; orderId: bigint }, gateway: CommerceGateway, targets: NotificationTarget[]) {
  if (!gateway.ready) return { status: 'unavailable' as const };
  const [row] = await db.$queryRaw<{ id: bigint; order_id: bigint; provider: string; provider_ref: string | null; redirect_url: string | null; merchant_order_id: string; amount_minor: number; currency: 'SAR'; status: PaymentAttempt['status'] }[]>`
    SELECT a.* FROM commerce_payment_attempts a INNER JOIN commerce_orders o ON o.id=a.order_id
    WHERE o.id=${input.orderId} AND o.member_id=${input.memberId}`;
  if (!row || row.provider !== gateway.id || !row.provider_ref) return { status: 'action_required' as const };
  const attempt: PaymentAttempt = { id: row.id, orderId: row.order_id, provider: row.provider, reference: row.provider_ref,
    redirectUrl: row.redirect_url, merchantOrderId: row.merchant_order_id, amountMinor: row.amount_minor, currency: row.currency, status: row.status };
  const evidence = await gateway.verify(attempt);
  if (!evidence || !paymentMatches({ ...attempt, reference: row.provider_ref }, evidence)) return { status: 'action_required' as const };
  const paid = await settleVerifiedPayment(db, evidence, targets);
  return { status: 'paid' as const, orderId: paid.orderId, alreadyPaid: paid.alreadyPaid };
}
