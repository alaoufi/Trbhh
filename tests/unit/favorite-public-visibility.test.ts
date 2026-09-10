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
import { getAdsByIdsCards } from '@/lib/data';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  db.ads.count.mockResolvedValue(1);
  db.ads.findMany.mockResolvedValue([{ id: 42n, user_id: 1n, city_id: 1n, area_id: 2, category_id: 1n, title: 'شاليه', price: 500, price_type: 'rent', rent_period: 'يومي', adsType: 'offer', adsSpecial: '', created_at: new Date(), expires_at: null }]);
  db.users.findMany.mockImplementation(({ where }) => Promise.resolve(where.ban ? [] : [{ id: 1n, name: 'المعلن', trusted: 0, ban: '' }]));
  db.cities.findMany.mockResolvedValue([{ id: 1n, name: 'الرياض' }]);
  db.areas.findMany.mockResolvedValue([{ id: 2, name: 'الخرج' }]);
  db.categories.findMany.mockResolvedValue([]);
  db.photos.findMany.mockResolvedValue([]);
  db.ads_views.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (value as Record<string, unknown>[]).every((part) => matches(row, part));
    if (key === 'OR') return (value as Record<string, unknown>[]).some((part) => matches(row, part));
    if (value && typeof value === 'object') return 'in' in value && (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
}
describe('favorites and comparison eligibility', () => {
  it('omits hidden or archived ads while retaining valid direct store products and caller ordering', async () => {
    const base = { user_id: 1n, city_id: 1n, area_id: 2, category_id: 1n, title: 'منتج', price: 500, adsType: 'offer', adsSpecial: '', created_at: new Date(), expires_at: null, status: 1, state: 'active', data_archive: null, store_only: 0 };
    const rows = [{ ...base, id: 1n, status: 0 }, { ...base, id: 2n, state: 'inactive' }, { ...base, id: 3n, data_archive: '2026-09-01' }, { ...base, id: 4n }, { ...base, id: 5n, store_only: 1 }];
    db.ads.findMany.mockImplementation(async ({ where }) => rows.filter((row) => matches(row, where)));
    expect((await getAdsByIdsCards([5, 1, 4, 2, 3, 5, 999], 0)).map((ad) => ad.id)).toEqual([5, 4]);
  });
});
