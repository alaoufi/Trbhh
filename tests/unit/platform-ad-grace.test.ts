import { describe, expect, it } from 'vitest';
import { effectiveFreeDays, freeUntil, PLATFORM_AD_MIN_FREE_DAYS } from '@/lib/platform-ad-grace';

describe('platform ad free display grace', () => {
  it('never grants less than the minimum so ads are not born hidden', () => {
    expect(effectiveFreeDays(0)).toBe(PLATFORM_AD_MIN_FREE_DAYS);
    expect(effectiveFreeDays(-5)).toBe(PLATFORM_AD_MIN_FREE_DAYS);
    expect(effectiveFreeDays(Number.NaN)).toBe(PLATFORM_AD_MIN_FREE_DAYS);
    expect(effectiveFreeDays(7)).toBe(7);
    expect(effectiveFreeDays(90.9)).toBe(90);
  });
  it('computes the expiry from the given moment', () => {
    const now = new Date('2026-11-12T00:00:00Z');
    expect(freeUntil(now, 10).toISOString()).toBe('2026-11-22T00:00:00.000Z');
    expect(freeUntil(now, 0).toISOString()).toBe('2026-12-12T00:00:00.000Z');
  });
});
