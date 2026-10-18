import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  charge: vi.fn(async () => ({ ok: true, balance: 100 })),
  create: vi.fn(async () => ({ id: 817n, category_id: 1n })),
  update: vi.fn(async () => ({})),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  users: { findUnique: async () => ({ country_id: 1 }), update: async () => ({}) },
  ads: { create: mocks.create, update: mocks.update, findMany: async () => [], count: async () => 2 },
} }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7 }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/storage', () => ({}));
vi.mock('@/lib/watermark', () => ({}));
vi.mock('@/lib/error-log', () => ({}));
vi.mock('@/lib/phash', () => ({}));
vi.mock('@/lib/moderation', () => ({ isUserBanned: async () => false, checkFlood: async () => ({ blocked: false }) }));
vi.mock('@/lib/packages', () => ({
  getUserPackage: async () => ({ adsPerDay: 0, gapHours: 0 }), canRepeatOwnAdWithPackage: () => true,
  applyFeaturedToNewAd: async () => {}, logAdPublish: async () => {},
}));
vi.mock('@/lib/settings', () => ({
  getSettingBool: async () => false, SETTING_ADS_APPROVAL: 'ads_approval', getDupThresholds: async () => ({ title: 95, detail: 95 }),
  getServicePricing: async () => ({ featured: { month: 37 } }), isDur: (value: string) => value === 'month',
  DUR_DAYS: { month: 30 }, DUR_LABEL: { month: 'month' }, getAdExtras: async () => ({ urgentPacks: [{ hours: 48, price: 19 }] }),
}));
vi.mock('@/lib/data', () => ({ bustAdCaches: async () => {} }));
vi.mock('@/lib/ad-media', () => ({}));
vi.mock('@/lib/user-location', () => ({}));
vi.mock('@/lib/content-guard', () => ({ censorGuard: async () => ({ parts: ['title', 'detail'], hits: [] }), scanContent: async () => null }));
vi.mock('@/lib/nsfw', () => ({ imageModerationEnabled: () => false }));
vi.mock('@/lib/maps', () => ({}));
vi.mock('@/lib/merchant', () => ({ isApprovedStoreOwner: async () => false }));
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
  beforeEach(() => { vi.clearAllMocks(); mocks.charge.mockResolvedValue({ ok: true, balance: 100 }); });
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
