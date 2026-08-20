import { describe, expect, it } from 'vitest';
import * as arb from '@/lib/payments/providers/alrajhi-arb';

describe('Al Rajhi callback failure diagnostic', () => {
  it('extracts only the official IPAY failure code from a decrypted callback', () => {
    const extract = (arb as Record<string, unknown>).extractArbFailureCode;
    expect(typeof extract).toBe('function');
    expect((extract as (data: Record<string, unknown>) => string | null)({
      errorText: 'Problem occurred while validating transaction data (IPAY0100124)',
      card: 'should never be returned',
    })).toBe('IPAY0100124');
  });
});
