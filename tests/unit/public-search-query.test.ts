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
vi.mock('@/lib/settings', () => ({ getSetting: async () => '0', getPlatformAdLifecycleConfig: vi.fn(), getStoreSubPricing: vi.fn() }));
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
  it('partitions newest by explicit checked flag rather than descending strings', async () => {
    db.ads.count.mockResolvedValue(1);
    db.ads.findMany.mockImplementation(async ({where,skip,take,orderBy}) => {
      const fixture=[{id:3201n,adsSpecial:'checked'},{id:4000n,adsSpecial:'no'},{id:4100n,adsSpecial:''}];
      const partition=where.AND?.find((part:Record<string,unknown>)=>Object.hasOwn(part,'adsSpecial'))?.adsSpecial;
      const selected=partition==='checked'?fixture.filter(r=>r.adsSpecial==='checked'):partition?fixture.filter(r=>r.adsSpecial!=='checked'):fixture;
      selected.sort((a,b)=>orderBy[0].adsSpecial ? b.adsSpecial.localeCompare(a.adsSpecial) : Number(b.id-a.id));
      return selected.slice(skip,skip+take).map(r=>({...r,user_id:1n,city_id:1n,area_id:2,category_id:32n,title:'Fixture',price:0,adsType:'offer',created_at:new Date(),expires_at:null}));
    });
    const cards=await searchAds({categoryId:32,take:2});
    expect(cards.map(c=>c.id)).toEqual([3201,4100]);
    for(const [args] of db.ads.findMany.mock.calls){
      expect(args.where.AND).toContainEqual(expect.objectContaining({category_id:32n,status:1}));
      expect(args.take).toBeLessThanOrEqual(2);
      expect(args.orderBy).toEqual([{bumped_at:{sort:'desc',nulls:'last'}},{id:'desc'}]);
    }
    vi.useRealTimers();
  });
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
  it.each(['price_asc','price_desc'] as const)('keeps explicit %s on one query with identical filters and pagination', async sort => {
    const query = { q: 'شاليه', cityId: 1, areaId: 2, minPrice: 800, maxPrice: 500, special: true, sort };
    await countSearchAds(query);
    const cards = await searchAds({ ...query, take: 48, skip: 48 });
    const countWhere = db.ads.count.mock.calls[0][0].where;
    const findArgs = db.ads.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual(countWhere);
    expect(countWhere).toMatchObject({ status: 1, city_id: 1n, area_id: { in: [2] }, adsSpecial: 'checked', price: { gt: 0, gte: 500, lte: 800 } });
    expect(findArgs).toMatchObject({ skip: 48, take: 48, orderBy: [{ price: sort==='price_asc'?'asc':'desc' }, { id: 'desc' }] });
    expect(db.ads.count).toHaveBeenCalledTimes(1); // only the explicit countSearchAds call
    expect(db.ads.findMany).toHaveBeenCalledTimes(1);
    expect(cards[0]).toMatchObject({ price: 500, priceType: 'rent', rentPeriod: 'يومي', cityName: 'الخرج' });
    vi.useRealTimers();
  });
  it('keeps all original filters on the featured count and both newest partitions',async()=>{
    const query={q:'fixture',categoryId:32,cityId:1,areaId:2,minPrice:10,maxPrice:20,type:'offer' as const};
    await countSearchAds(query);
    const base=db.ads.count.mock.calls[0][0].where;
    db.ads.findMany.mockResolvedValue([]);
    await searchAds({...query,take:24,skip:0});
    expect(db.ads.count.mock.calls[1][0].where).toEqual({AND:[base,{adsSpecial:'checked'}]});
    expect(db.ads.findMany.mock.calls.map(([args])=>({where:args.where,skip:args.skip,take:args.take}))).toEqual([
      {where:{AND:[base,{adsSpecial:'checked'}]},skip:0,take:1},
      {where:{AND:[base,{adsSpecial:{not:'checked'}}]},skip:0,take:23},
    ]);
    vi.useRealTimers();
  });
  it('handles an empty newest result without fetching the featured partition',async()=>{
    db.ads.count.mockResolvedValue(0);db.ads.findMany.mockResolvedValue([]);
    expect(await searchAds({take:24,skip:48})).toEqual([]);
    expect(db.ads.findMany).toHaveBeenCalledTimes(1);
    expect(db.ads.findMany.mock.calls[0][0]).toMatchObject({take:24,skip:48,where:{AND:expect.arrayContaining([{adsSpecial:{not:'checked'}}])}});
    vi.useRealTimers();
  });
});
