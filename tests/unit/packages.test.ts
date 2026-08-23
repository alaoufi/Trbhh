import { describe, expect, it } from 'vitest';
import { canRepeatOwnAdWithPackage, packagePurchaseExpiry } from '@/lib/packages';

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
});
