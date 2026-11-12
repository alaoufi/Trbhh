import { describe, expect, it } from 'vitest';
import { packageExpiryGroups } from '@/lib/package-expiry';

const now = new Date('2026-11-12T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

describe('archiving by package ad lifetime', () => {
  it('applies the default lifetime to everyone without an active subscription', () => {
    const groups = packageExpiryGroups({ plans: [], defaultDays: 30, subscriptions: [], now });
    expect(groups).toHaveLength(1);
    expect(groups[0].cutoff.toISOString()).toBe(day(30));
    expect(groups[0].userIn).toBeUndefined();
    expect(groups[0].userNotIn).toBeUndefined();
  });
  it('uses each subscriber\'s own package lifetime and excludes them from the default', () => {
    const groups = packageExpiryGroups({
      plans: [{ id: 1, adDays: 60 }, { id: 2, adDays: 50 }], defaultDays: 30, now,
      subscriptions: [{ userId: 7, packageId: 1 }, { userId: 8, packageId: 2 }, { userId: 9, packageId: 1 }],
    });
    expect(groups[0]).toMatchObject({ userNotIn: [7n, 8n, 9n] });
    expect(groups.find((g) => g.userIn?.includes(7n))).toMatchObject({ userIn: [7n, 9n] });
    expect(groups.find((g) => g.userIn?.includes(7n))!.cutoff.toISOString()).toBe(day(60));
    expect(groups.find((g) => g.userIn?.includes(8n))!.cutoff.toISOString()).toBe(day(50));
  });
  it('never archives under an unlimited lifetime (0), default or subscribed', () => {
    expect(packageExpiryGroups({ plans: [], defaultDays: 0, subscriptions: [], now })).toEqual([]);
    const groups = packageExpiryGroups({ plans: [{ id: 1, adDays: 0 }], defaultDays: 30, subscriptions: [{ userId: 7, packageId: 1 }], now });
    expect(groups).toHaveLength(1);
    expect(groups[0].userNotIn).toEqual([7n]);
  });
  it('treats a subscription to an inactive or unknown package as the default', () => {
    const groups = packageExpiryGroups({ plans: [{ id: 1, adDays: 60 }], defaultDays: 30, subscriptions: [{ userId: 7, packageId: 99 }], now });
    expect(groups).toHaveLength(1);
    expect(groups[0].userNotIn).toBeUndefined();
  });
});
