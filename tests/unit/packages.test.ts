import { describe, expect, it } from 'vitest';
import { adQuota, canRepeatOwnAdWithPackage, packagePurchaseExpiry } from '@/lib/packages';

describe('member package purchase policy', () => {
  it('extends an active package from its current expiry', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');
    const activeUntil = new Date('2026-09-01T12:00:00.000Z');
    expect(packagePurchaseExpiry(30, activeUntil, now)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });

  it('starts an expired package from the purchase time', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');
    expect(packagePurchaseExpiry(30, new Date('2026-08-01T12:00:00.000Z'), now)).toEqual(new Date('2026-09-20T12:00:00.000Z'));
  });

  it('allows own-ad repeats only for paid packages', () => {
    expect(canRepeatOwnAdWithPackage({ price: 50, isDefault: false })).toBe(true);
    expect(canRepeatOwnAdWithPackage({ price: 0, isDefault: true })).toBe(false);
  });

  it('shows exact remaining daily ads for a limited package', () => {
    expect(adQuota(3, 1)).toEqual({ limit: 3, used: 1, remaining: 2, unlimited: false });
    expect(adQuota(0, 9)).toEqual({ limit: 0, used: 9, remaining: null, unlimited: true });
  });
});
