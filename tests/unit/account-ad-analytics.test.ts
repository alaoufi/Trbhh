import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ads: { findMany: vi.fn() }, ads_views: { groupBy: vi.fn() },
  ad_contacts: { groupBy: vi.fn() }, favorites: { groupBy: vi.fn() },
  photos: { findMany: vi.fn() }, $queryRawUnsafe: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getAdPeriodStats, getSellerAnalytics } from '@/lib/analytics';

describe('account ad period analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    db.ads.findMany.mockResolvedValue([{ id: 631n, title: 'إعلان', status: 1 }]);
    db.ads_views.groupBy.mockResolvedValue([{ ads_id: 631n, _count: 605 }]);
    db.$queryRawUnsafe.mockResolvedValue([
      { ads_id: 631n, d: '2026-09-10', c: 12n },
      { ads_id: 631n, d: '2026-09-04', c: 27n },
      { ads_id: 631n, d: '2026-08-12', c: 95n },
    ]);
    db.ad_contacts.groupBy.mockImplementation(async ({ where }) => [{
      ad_id: 631n, _count: { _all: !where.created_at ? 9 : where.created_at.gte.toISOString().startsWith('2026-09-03T21:00') ? 2 : 6 },
    }]);
    db.favorites.groupBy.mockResolvedValue([{ ads_id: 631n, _count: { _all: 4 } }]);
    db.photos.findMany.mockResolvedValue([]);
  });

  it('returns different real 7-day, 30-day and lifetime metrics, retaining current favorites separately', async () => {
    const stats = (await getAdPeriodStats([631])).get(631)!;
    expect(stats.periods['7d']).toEqual({ views: 39, contacts: 2 });
    expect(stats.periods['30d']).toEqual({ views: 134, contacts: 6 });
    expect(stats.periods.all).toEqual({ views: 605, contacts: 9 });
    expect(stats.favorites).toBe(4);
    expect(db.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([631, new Date('2026-08-11T21:00:00Z'), new Date('2026-09-10T21:00:00Z')]);
  });

  it('uses the same period totals for the seller summary as the ad cards', async () => {
    const perAd = (await getAdPeriodStats([631])).get(631)!;
    const seller = await getSellerAnalytics(12, { type: 'personal', id: 2, isDefault: false });
    expect(seller.views7).toBe(perAd.periods['7d'].views);
    expect(seller.views30).toBe(perAd.periods['30d'].views);
    expect(seller.totalViews).toBe(605);
    expect(seller.daily).toHaveLength(30);
    expect(db.ads.findMany.mock.calls[0][0].where.profile_id).toBe(2n);
  });

  it('starts a new Saudi calendar day at 21:00 UTC on both account surfaces', async () => {
    vi.setSystemTime(new Date('2026-09-10T21:30:00Z'));
    const seller = await getSellerAnalytics(12);
    expect(seller.daily.at(-1)?.date).toBe('2026-09-11');
    expect(db.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([631, new Date('2026-08-12T21:00:00Z'), new Date('2026-09-11T21:00:00Z')]);
    expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('DATE_ADD(v.created_at, INTERVAL 3 HOUR)');
  });
  it('returns empty results without issuing unscoped metric queries', async () => {
    expect(await getAdPeriodStats([])).toEqual(new Map());
    expect(db.ads_views.groupBy).not.toHaveBeenCalled();
  });
});
