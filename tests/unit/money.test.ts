import { describe, expect, it } from 'vitest';
import { formatHalalas, parseSarToHalalas, refundableHalalas } from '@/lib/money';

describe('money', () => {
  it('parses Saudi riyal input exactly without floating point', () => {
    expect(parseSarToHalalas('10.25')).toBe(1025);
    expect(parseSarToHalalas('10')).toBe(1000);
    expect(parseSarToHalalas(' 0.01 ')).toBe(1);
    expect(parseSarToHalalas('10.257')).toBeNull();
  });

  it('formats an amount from integer halalas', () => {
    expect(formatHalalas(1025)).toBe('10.25');
    expect(formatHalalas(-1)).toBe('-0.01');
  });

  it('rounds a fractional unused service period up to the member halala', () => {
    expect(refundableHalalas(101, new Date(0), new Date(100), new Date(50))).toBe(51);
  });
});
