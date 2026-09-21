import 'server-only';
import { claimPaymentAttempt, recordPaymentReference, markPaymentUncertain } from './orders';
import type { CommerceDb, PaymentAttempt, VerifiedPayment } from './types';

/** A commerce-specific contract. Legacy top-up callbacks must never be used. */
export interface CommerceGateway {
  id: string;
  ready: boolean;
  create(attempt: PaymentAttempt): Promise<{ reference: string; redirectUrl: string }>;
  verify(attempt: PaymentAttempt): Promise<VerifiedPayment | null>;
  isSafeRedirect(url: string): boolean;
}
export type CommercePaymentResult = { status: 'redirect'; url: string } | { status: 'paid' | 'action_required' | 'unavailable' };

export async function initiateCommercePayment(
  db: CommerceDb, input: { memberId: bigint; orderId: bigint }, gateway: CommerceGateway,
): Promise<CommercePaymentResult> {
  if (!gateway.ready) return { status: 'unavailable' };
  // دفاع في العمق: لا يُبدأ أي دفع حقيقي إذا كان مفتاح الشراء المركزي معطّلاً.
  const [pflag] = await db.$queryRaw<{ v: string | null }[]>`SELECT v FROM site_settings WHERE k='commerce_purchasing_enabled' LIMIT 1`;
  if ((pflag?.v ?? '0') !== '1') return { status: 'unavailable' };
  const claim = await claimPaymentAttempt(db, { ...input, provider: gateway.id });
  if (!claim.claimed) {
    if (claim.attempt.status === 'paid') return { status: 'paid' };
    if (claim.attempt.provider === gateway.id && claim.attempt.status === 'pending'
      && claim.attempt.reference && claim.attempt.redirectUrl && gateway.isSafeRedirect(claim.attempt.redirectUrl)) {
      return { status: 'redirect', url: claim.attempt.redirectUrl };
    }
    return { status: 'action_required' };
  }
  try {
    // Exactly one network create call, after durable claim, outside any DB transaction.
    const created = await gateway.create(claim.attempt);
    if (!gateway.isSafeRedirect(created.redirectUrl)) throw new Error('unsafe_gateway_redirect');
    await recordPaymentReference(db, { attemptId: claim.attempt.id, claimToken: claim.claimToken,
      reference: created.reference, redirectUrl: created.redirectUrl });
    return { status: 'redirect', url: created.redirectUrl };
  } catch {
    // Failure can happen after the bank accepted. Neither create nor charge is retried.
    // If this DB write also fails, the original durable `creating` claim still blocks repeats.
    await markPaymentUncertain(db, { attemptId: claim.attempt.id, claimToken: claim.claimToken }).catch(() => {});
    return { status: 'action_required' };
  }
}
