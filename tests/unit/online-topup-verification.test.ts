import { describe, expect, it } from 'vitest';
import { canDeleteTestOnlineTopup, onlineTopupVerificationOutcome } from '@/lib/payments/admin-verification';

describe('online top-up admin verification', () => {
  it('only reports approval after the payment row is credited atomically', () => {
    expect(onlineTopupVerificationOutcome({ status: 1, paid: true, credited: true })).toBe('approved');
    expect(onlineTopupVerificationOutcome({ status: 1, paid: true, credited: false })).toBe('unresolved');
  });

  it('reports a bank rejection and leaves unverified payments pending', () => {
    expect(onlineTopupVerificationOutcome({ status: 2, paid: false, credited: false })).toBe('rejected');
    expect(onlineTopupVerificationOutcome({ status: 0, paid: false, credited: false })).toBe('pending');
  });

  it('permits deletion only for an uncredited pending online test request', () => {
    expect(canDeleteTestOnlineTopup({ source: 'online', status: 0 })).toBe(true);
    expect(canDeleteTestOnlineTopup({ source: 'online', status: 1 })).toBe(false);
    expect(canDeleteTestOnlineTopup({ source: null, status: 0 })).toBe(false);
  });
});
