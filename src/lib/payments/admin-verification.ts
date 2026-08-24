/**
 * Admin payment screens may ask the bank to verify a pending online top-up,
 * but they must never approve it themselves. "approved" therefore requires
 * the same atomic credit path used by the callback.
 */
export type OnlineTopupVerificationOutcome = 'approved' | 'rejected' | 'pending' | 'unresolved';

export function onlineTopupVerificationOutcome(input: { status: number; paid: boolean; credited: boolean }): OnlineTopupVerificationOutcome {
  if (input.status === 1 && input.paid && input.credited) return 'approved';
  if (input.status === 2) return 'rejected';
  if (input.status === 0) return 'pending';
  return 'unresolved';
}
