import { describe, expect, it } from 'vitest';
import { cancellationOutcome } from '@/lib/member-services';

describe('member service cancellation policy', () => {
  it('allows cancellation without refund when the service snapshot says so', () => {
    expect(cancellationOutcome(true, false, 2000)).toEqual({ allowed: true, refundHalalas: 0 });
  });

  it('blocks cancellation when the service snapshot disallows it', () => {
    expect(cancellationOutcome(false, true, 2000)).toEqual({ allowed: false, refundHalalas: 0 });
  });
});
