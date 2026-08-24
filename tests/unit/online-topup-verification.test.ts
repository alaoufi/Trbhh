import { describe, expect, it } from 'vitest';
import { onlineTopupVerificationOutcome } from '@/lib/payments/admin-verification';

describe('online top-up admin verification', () => {
  it('only reports approval after the payment row is credited atomically', () => {
    expect(onlineTopupVerificationOutcome({ status: 1, paid: true, credited: true })).toBe('approved');
    expect(onlineTopupVerificationOutcome({ status: 1, paid: true, credited: false })).toBe('unresolved');
  });

  it('reports a bank rejection and leaves unverified payments pending', () => {
    expect(onlineTopupVerificationOutcome({ status: 2, paid: false, credited: false })).toBe('rejected');
    expect(onlineTopupVerificationOutcome({ status: 0, paid: false, credited: false })).toBe('pending');
  });
});
