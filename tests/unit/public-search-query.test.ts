import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ads: { findMany: vi.fn(), count: vi.fn() }, users: { findMany: vi.fn() },
  areas: { findMany: vi.fn() }, cities: { findMany: vi.fn() }, categories: { findMany: vi.fn() },
  photos: { findMany: vi.fn() }, ads_views: { groupBy: vi.fn() }, $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/redis', () => ({ cached: vi.fn(), cacheDel: vi.fn(), cacheDelPattern: vi.fn() }));
vi.mock('@/lib/censor', () => ({ loadBanned: vi.fn(), censorSync: (value: string) => value }));
vi.mock('@/lib/profiles', () => ({ getProfileDisplay: vi.fn() }));
vi.mock('@/lib/seed-areas', () => ({ ensureSaudiAreas: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getPlatformAdLifecycleConfig: vi.fn(), getStoreSubPricing: vi.fn() }));
vi.mock('@/lib/platform-ad-visibility', () => ({ currentPlatformAdPublicWhere: async () => ({ status: 1, state: 'active', AND: [{ store_only: 0 }] }), platformDealAdPublicWhere: vi.fn() }));
vi.mock('@/lib/ad-reviews', () => ({ getAdRatingsBrief: async () => new Map() }));
vi.mock('@/lib/packages', () => ({
  sweepExpiredFeatured: vi.fn(), getFeaturedTierMap: vi.fn(), getUsersAdMeta: async () => new Map(),
  getPackages: async () => [], getDefaultPackage: async () => ({ adDays: 0 }), FREE_FALLBACK: { adDays: 0 },
}));
import { countSearchAds, searchAds } from '@/lib/data';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  db.ads.count.mockResolvedValue(1);
  db.ads.findMany.mockResolvedValue([{ id: 42n, user_id: 1n, city_id: 1n, area_id: 2, category_id: 1n, title: 'شاليه', price: 500, price_type: 'rent', rent_period: 'يومي', adsType: 'offer', adsSpecial: '', created_at: new Date(), expires_at: null }]);
  db.users.findMany.mockImplementation(({ where }) => Promise.resolve(where.ban ? [] : [{ id: 1n, name: 'المعلن', trusted: 0, ban: '' }]));
  db.cities.findMany.mockResolvedValue([{ id: 1n, name: 'الرياض' }]);
  db.areas.findMany.mockResolvedValue([{ id: 2, name: 'الخرج', city_id: 1 }]);
  db.categories.findMany.mockResolvedValue([]);
  db.photos.findMany.mockResolvedValue([]);
  db.ads_views.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe('public search query integration', () => {
  it('matches every equivalent city ID in the selected region without crossing regions', async () => {
    db.areas.findMany.mockResolvedValue([
      { id: 2, name: 'أم  الحمام', city_id: 1 },
      { id: 3, name: 'ام الحمام ', city_id: 1 },
      { id: 4, name: 'أم الحمام', city_id: 2 },
      { id: 5, name: 'الخرج', city_id: 1 },
    ]);
    await countSearchAds({ cityId: 1, areaId: 2 });
    expect(db.ads.count.mock.calls[0][0].where).toMatchObject({ city_id: 1n, area_id: { in: [2, 3] } });
    vi.useRealTimers();
  });
  it('uses identical effective visibility and prices for count and rows, with preserved sort and page', async () => {
    const query = { q: 'شاليه', cityId: 1, areaId: 2, minPrice: 800, maxPrice: 500, special: true, sort: 'price_asc' as const };
    await countSearchAds(query);
    const cards = await searchAds({ ...query, take: 48, skip: 48 });
    const countWhere = db.ads.count.mock.calls[0][0].where;
    const findArgs = db.ads.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual(countWhere);
    expect(countWhere).toMatchObject({ status: 1, city_id: 1n, area_id: { in: [2] }, adsSpecial: 'checked', price: { gt: 0, gte: 500, lte: 800 } });
    expect(findArgs).toMatchObject({ skip: 48, take: 48, orderBy: [{ price: 'asc' }, { id: 'desc' }] });
    expect(cards[0]).toMatchObject({ price: 500, priceType: 'rent', rentPeriod: 'يومي', cityName: 'الخرج' });
    vi.useRealTimers();
  });
});
