import { describe, expect, it } from 'vitest';
import { formatSar, newPlatformAdDecision, platformAdState, renewalDecision } from '@/lib/platform-ad-lifecycle';

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

  it('grants only the configured free duration to a new general ad within the daily allowance', () => {
    expect(newPlatformAdDecision({ enabled: true, storeOnly: false, freeUsedToday: 1, freeDailyLimit: 2, freeDays: 10 })).toEqual({ grantFreeDays: 10, needsPayment: false });
  });

  it('requires payment after the allowance and for store-only items promoted to Trbhh', () => {
    expect(newPlatformAdDecision({ enabled: true, storeOnly: false, freeUsedToday: 2, freeDailyLimit: 2, freeDays: 10 })).toEqual({ grantFreeDays: 0, needsPayment: true });
    expect(newPlatformAdDecision({ enabled: true, storeOnly: true, freeUsedToday: 0, freeDailyLimit: 2, freeDays: 10 })).toEqual({ grantFreeDays: 0, needsPayment: true });
  });

  it('does not turn an advertisement published before enforcement into a paid-only item', () => {
    expect(newPlatformAdDecision({ enabled: false, storeOnly: false, freeUsedToday: 99, freeDailyLimit: 0, freeDays: 0 })).toEqual({ grantFreeDays: 0, needsPayment: false });
  });
});
