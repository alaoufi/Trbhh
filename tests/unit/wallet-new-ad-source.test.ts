import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  storeLink: vi.fn(async () => ({count:1})),
  others: [] as {id:bigint;title:string;detail:string}[],
  ban:vi.fn(),dupAttempt:vi.fn(async()=>3),
  storeId: 44, approval:false, censored:false,
  followers:vi.fn(async()=>{}),
  cache: vi.fn(async () => {}),
  charge: vi.fn(async () => ({ ok: true, balance: 100 })),
  create: vi.fn(async () => ({ id: 817n, category_id: 1n })),
  update: vi.fn(async () => ({})),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  profiles: {findFirst:async()=>({id:9n})},
  store_products: {createMany:mocks.storeLink},
  users: { findUnique: async () => ({ country_id: 1 }), update: async () => ({}) },
  ads: { create: mocks.create, update: mocks.update, findMany: async () => mocks.others, count: async () => 2 },
} }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7 }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/storage', () => ({}));
vi.mock('@/lib/watermark', () => ({}));
vi.mock('@/lib/error-log', () => ({}));
vi.mock('@/lib/phash', () => ({}));
vi.mock('@/lib/moderation', () => ({ isUserBanned: async () => false, logMod:async()=>{}, banUserFor:mocks.ban, bumpDupAttempts:mocks.dupAttempt, DUP_LIMIT:3, notifyModBlock:async()=>{}, checkFlood: async () => ({ blocked: false }) }));
vi.mock('@/lib/packages', () => ({
  getUserPackage: async () => ({ adsPerDay: 0, gapHours: 0 }), canRepeatOwnAdWithPackage: () => true,
  applyFeaturedToNewAd: async () => {}, logAdPublish: async () => {},
}));
vi.mock('@/lib/settings', () => ({
  getSettingBool: async (key:string) => key==='ads_approval' && mocks.approval, SETTING_ADS_APPROVAL: 'ads_approval', getDupThresholds: async () => ({ title: 95, detail: 95 }),
  getServicePricing: async () => ({ featured: { month: 37 } }), isDur: (value: string) => value === 'month',
  DUR_DAYS: { month: 30 }, DUR_LABEL: { month: 'month' }, getAdExtras: async () => ({ urgentPacks: [{ hours: 48, price: 19 }] }),
}));
vi.mock('@/lib/data', () => ({ bustAdCaches: mocks.cache }));
vi.mock('@/lib/ad-media', () => ({}));
vi.mock('@/lib/user-location', () => ({}));
vi.mock('@/lib/content-guard', () => ({ censorGuard: async () => ({ parts: ['title', 'detail'], hits: mocks.censored ? [{}] : [] }), summarizeHits:()=>'test', scanContent: async () => null }));
vi.mock('@/lib/nsfw', () => ({ imageModerationEnabled: () => false }));
vi.mock('@/lib/maps', () => ({}));
vi.mock('@/lib/merchant', () => ({ isApprovedStoreOwner: async () => false, storeStatusOfUser:async()=>1, storeIdOfUser:async()=>mocks.storeId, getActiveStoreId:async()=>mocks.storeId, staffStoreId:async()=>0, getStoreWatermark:async()=>undefined, notifyStoreFollowers:mocks.followers,addStoreProduct:async()=>{} }));
vi.mock('@/lib/subscription',()=>({isStoreSubBlocked:async()=>false}));
vi.mock('@/lib/profiles', () => ({ getActiveProfile: async () => ({ id: 3, type: 'personal', isDefault: true }) }));
vi.mock('@/lib/classifier', () => ({ classifyAdText: async () => ({ categoryId: 1 }) }));
vi.mock('@/lib/ad-categories/service', () => ({ writeAdWithCategory: async (tx: unknown, _form: FormData, write: (tx: unknown, category: null) => unknown) => write(tx, null) }));
vi.mock('@/lib/wallet', () => ({ charge: mocks.charge }));
vi.mock('@/lib/points', () => ({}));
vi.mock('@/lib/saved-search', () => ({ notifySavedSearches: async () => {}, notifyOppositeType: async () => {} }));
import { createAdAction } from '@/app/ads/actions';

function form(extras: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: 'title', detail: 'detail', pledge: '1', phone: '0500000000', adId: '999', ...extras })) if (value !== undefined) data.set(key, value);
  return data;
}

describe('actual new ad action preserves created source for paid extras', () => {
  beforeEach(() => { vi.clearAllMocks();mocks.others=[]; mocks.storeId=44;mocks.approval=false;mocks.censored=false; mocks.storeLink.mockResolvedValue({count:1}); mocks.charge.mockResolvedValue({ ok: true, balance: 100 }); });
  it.each([
    { extras: { featuredDur: 'month' }, reason: 'featured', price: 37, flag: 'featured=1' },
    { extras: { urgent: '48' }, reason: 'urgent', price: 19, flag: 'urgent=1' },
  ])('passes the persisted new ad ID for $reason and its unchanged configured price', async ({ extras, reason, price, flag }) => {
    await expect(createAdAction(form(extras))).rejects.toThrow(`/ads/817?${flag}`);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.charge).toHaveBeenCalledExactlyOnceWith(7, price, reason, expect.any(String), { kind: 'ad', id: 817n, service: reason });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 817n } }));
  });
  it('charges each selected extra once, both referencing the actual created ID', async () => {
    await expect(createAdAction(form({ featuredDur: 'month', urgent: '48' }))).rejects.toThrow('/ads/817?urgent=1&featured=1');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.charge).toHaveBeenCalledTimes(2);
    expect(mocks.charge).toHaveBeenNthCalledWith(1, 7, 37, 'featured', expect.any(String), { kind: 'ad', id: 817n, service: 'featured' });
    expect(mocks.charge).toHaveBeenNthCalledWith(2, 7, 19, 'urgent', expect.any(String), { kind: 'ad', id: 817n, service: 'urgent' });
  });
  it('preserves publishing and does not retry or grant extras after declined charges', async () => {
    mocks.charge.mockResolvedValue({ ok: false, balance: 0 });
    await expect(createAdAction(form({ featuredDur: 'month', urgent: '48' }))).rejects.toThrow('/ads/817?urgentneed=1&featuredneed=1');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.charge).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('new store ad publication',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.storeId=44;mocks.storeLink.mockResolvedValue({count:1});});
 it('links the exact created ad before cache invalidation and success',async()=>{
 await expect(createAdAction(form({dest:'store'}))).rejects.toThrow('/companies/44?added=1');
 expect(mocks.storeLink).toHaveBeenCalledWith({data:[{store_id:44,ad_id:817}],skipDuplicates:true});
 expect(mocks.storeLink.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
 expect(mocks.charge).not.toHaveBeenCalled();
 });
 it('never claims success or invalidates caches if the transactional showcase insert fails',async()=>{
 mocks.storeLink.mockRejectedValueOnce(new Error('showcase failed'));
 await expect(createAdAction(form({dest:'store'}))).rejects.toThrow('showcase failed');
 expect(mocks.cache).not.toHaveBeenCalled();expect(mocks.charge).not.toHaveBeenCalled();
 });
 it('rejects a missing store before creating an isolated invisible ad',async()=>{
 mocks.storeId=0;
 await expect(createAdAction(form({dest:'store'}))).rejects.toThrow('/ads/new?error=store&dest=store');
 expect(mocks.create).not.toHaveBeenCalled();
 });
});

describe('publish outcome accuracy',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.approval=false;mocks.censored=false;});
 it('reports pending review instead of falsely reporting public publication after censoring',async()=>{mocks.approval=true;mocks.censored=true;await expect(createAdAction(form({}))).rejects.toThrow('/account/ads?pending=1');expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:0})}));});
 it('keeps the normal published result linked to the actual persisted ad',async()=>{await expect(createAdAction(form({}))).rejects.toThrow('/?published=817');expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:1,store_only:0,state:'active'})}));});
});

describe('duplicate warnings do not ban members',()=>{
 it('rejects copied substantial text without escalating repeated retries to an account ban',async()=>{
 vi.clearAllMocks();mocks.approval=false;mocks.censored=false;
 const title='رافعة كهربائية للإيجار';const detail='رافعة كهربائية حمولة ثلاثة اطنان موديل حديث بحالة ممتازة مع صيانة دورية وتوصيل للمستودع';
 mocks.others=[{id:91n,title,detail}];
 for(let i=0;i<3;i++) await expect(createAdAction(form({title,detail}))).rejects.toThrow('/ads/new?error=crossdup&dup=91');
 expect(mocks.ban).not.toHaveBeenCalled();expect(mocks.dupAttempt).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();mocks.others=[];
 });
});
