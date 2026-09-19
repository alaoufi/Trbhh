import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ads: { findMany: vi.fn(), count: vi.fn() }, users: { findMany: vi.fn() },
  areas: { findMany: vi.fn() }, cities: { findMany: vi.fn() }, categories: { findMany: vi.fn() },
  sub_categories: { findMany: vi.fn() },
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
  db.ads.findMany.mockResolvedValue([{ id: 42n, user_id: 1n, city_id: 1n, area_id: 2, category_id: 1n, subcategory_id:10, title: 'شاليه', price: 500, price_type: 'rent', rent_period: 'يومي', adsType: 'offer', adsSpecial: '', created_at: new Date(), expires_at: null }]);
  db.users.findMany.mockImplementation(({ where }) => Promise.resolve(where.ban ? [] : [{ id: 1n, name: 'المعلن', trusted: 0, ban: '' }]));
  db.cities.findMany.mockResolvedValue([{ id: 1n, name: 'الرياض' }]);
  db.areas.findMany.mockResolvedValue([{ id: 2, name: 'الخرج', city_id: 1 }]);
  db.categories.findMany.mockResolvedValue([]);
  db.sub_categories.findMany.mockResolvedValue([]);
  db.photos.findMany.mockResolvedValue([]);
  db.ads_views.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});

describe('public search query integration', () => {
  it.each([true,false])('enforces explicit eligibility only in sandbox=%s, retaining old eligible ads', async sandbox => {
    vi.stubEnv('PREVIEW_SANDBOX',String(sandbox));
    const now=new Date();
    const base=(await db.ads.findMany())[0];
    db.ads.findMany.mockClear();
    const rows=[
      {id:1n,paused_by_owner:0,publish_at:null},
      {id:2n,paused_by_owner:0,publish_at:new Date(now.getTime()-1000)},
      {id:3n,paused_by_owner:0,publish_at:now},
      {id:4n,paused_by_owner:0,publish_at:new Date(now.getTime()+1000)},
      {id:5n,paused_by_owner:1,publish_at:null},
    ].map(row=>({...base,status:1,state:'active',store_only:0,created_at:new Date('2020-01-01'),...row}));
    // Execute the generated predicate on anomalous active fixtures, not just inspect text.
    function matches(where:Record<string,unknown>,row:Record<string,unknown>):boolean {
      return Object.entries(where).every(([key,value])=>{
        if(key==='AND')return (value as Record<string,unknown>[]).every(part=>matches(part,row));
        if(key==='OR')return (value as Record<string,unknown>[]).some(part=>matches(part,row));
        if(value && typeof value==='object' && !(value instanceof Date)) {
          const range=value as {lte?:Date;gte?:Date};
          if(range.lte)return row[key] instanceof Date && row[key]<=range.lte;
          if(range.gte)return row[key] instanceof Date && row[key]>=range.gte;
          throw new Error('Unexpected predicate in eligibility fixture: '+key);
        }
        return row[key]===value;
      });
    }
    db.ads.count.mockImplementation(({where})=>Promise.resolve(rows.filter(row=>matches(where,row)).length));
    db.ads.findMany.mockImplementation(({where,skip,take})=>Promise.resolve(rows.filter(row=>matches(where,row)).slice(skip,skip+take)));
    expect(await countSearchAds({})).toBe(sandbox?3:5);
    const cards=await searchAds({take:24,skip:0});
    expect(cards.map(card=>card.id)).toEqual(sandbox?[1,2,3]:[1,2,3,4,5]);
    const where=db.ads.count.mock.calls[0][0].where;
    expect(db.ads.findMany.mock.calls[0][0].where).toEqual(where);
    if(sandbox) {
      expect(where.AND).toContainEqual({paused_by_owner:0,OR:[{publish_at:null},{publish_at:{lte:now}}]});
    } else {
      expect(where).toEqual({status:1,state:'active',AND:[{store_only:0},{}]});
    }
  });
  it('sandbox filters count and paged rows by mapped pairs without weakening public visibility', async()=>{
    vi.stubEnv('PREVIEW_SANDBOX','true');
    db.categories.findMany.mockResolvedValue([{id:1n,name:'سيارات'}]);
    db.sub_categories.findMany.mockResolvedValue([{id:10n,category_id:1,name:'سيارات'}]);
    const query={category:'سيارات',subcategory:'سيارات'};
    await countSearchAds(query);
    const cards=await searchAds({...query,take:24,skip:24});
    const where=db.ads.count.mock.calls[0][0].where;
    expect(where).toMatchObject({status:1,state:'active'});
    expect(where.AND).toContainEqual({store_only:0});
    expect(where.AND).toContainEqual({OR:[{category_id:1n,subcategory_id:10}]});
    expect(db.ads.findMany.mock.calls[0][0]).toMatchObject({where,take:24,skip:24});
    expect(db.ads.findMany.mock.calls[0][0].where).toEqual(where);
    expect(cards[0].categoryName).toBe('سيارات / سيارات');
  });
  it('sandbox empty mappings display legacy ads as fallback and empty known groups query zero', async()=>{
    vi.stubEnv('PREVIEW_SANDBOX','true');
    const cards=await searchAds({});
    expect(cards[0].categoryName).toBe('أخرى / أخرى');
    await countSearchAds({category:'سيارات'});
    expect(db.ads.count.mock.calls[0][0].where.AND).toContainEqual({id:{in:[]}});
  });
  it('production ignores sandbox category names and never reads subcategory mappings', async()=>{
    vi.stubEnv('PREVIEW_SANDBOX','false');
    await countSearchAds({category:'سيارات',subcategory:'سيارات'});
    expect(db.ads.count.mock.calls[0][0].where.AND).not.toContainEqual({id:{in:[]}});
    expect(db.sub_categories.findMany).not.toHaveBeenCalled();
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
