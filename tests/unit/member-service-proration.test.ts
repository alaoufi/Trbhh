import { describe, expect, it } from 'vitest';
import { refundableHalalas, refundableRiyals } from '@/lib/member-service-proration';

describe('refundableRiyals', () => {
  it('returns half the fee after five of ten days have elapsed', () => {
    expect(refundableRiyals(
      20,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-11T00:00:00Z'),
      new Date('2026-08-06T00:00:00Z'),
    )).toBe(10);
  });

  it('clamps the refund to the valid 0..amount range', () => {
    expect(refundableRiyals(20, new Date('2026-08-01'), new Date('2026-08-11'), new Date('2026-08-20'))).toBe(0);
    expect(refundableRiyals(20, new Date('2026-08-01'), new Date('2026-08-11'), new Date('2026-07-20'))).toBe(20);
  });

  it('rounds a fractional riyal down to preserve the existing integer ledger', () => {
    expect(refundableRiyals(20, new Date('2026-08-01'), new Date('2026-08-07'), new Date('2026-08-03'))).toBe(13);
  });

  it('keeps fractional rights in halalas and rounds the result for the member', () => {
    expect(refundableHalalas(101, new Date(0), new Date(100), new Date(50))).toBe(51);
  });
});
