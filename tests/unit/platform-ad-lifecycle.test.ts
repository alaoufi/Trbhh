import { describe, expect, it } from 'vitest';
import { formatSar, platformAdState, renewalDecision } from '@/lib/platform-ad-lifecycle';

describe('platform ad lifecycle policy', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');

  it('keeps an ad with a future entitlement active', () => {
    expect(platformAdState({ enabled: true, storeOnly: false, until: new Date('2026-08-14T12:00:00.000Z'), now })).toBe('active');
  });

  it('marks an expired public entitlement as awaiting renewal', () => {
    expect(platformAdState({ enabled: true, storeOnly: false, until: new Date('2026-08-12T12:00:00.000Z'), now })).toBe('renewal-required');
  });

  it('marks an expired entitlement past its archive deadline as payment archived', () => {
    expect(platformAdState({ enabled: true, storeOnly: false, until: new Date('2026-08-01T12:00:00.000Z'), now, archiveAfterDays: 7 })).toBe('payment-archived');
  });

  it('keeps a store-front-only item outside the public payment lifecycle', () => {
    expect(platformAdState({ enabled: true, storeOnly: true, until: null, now })).toBe('store-front-only');
  });

  it('calculates an exact halala shortfall without rounding debt away', () => {
    expect(renewalDecision({ balance: 12.5, packagePrice: 50 })).toEqual({ allowed: false, shortfall: 37.5 });
    expect(formatSar(37.5)).toBe('37.50');
  });
});
