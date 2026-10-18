import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ classifiedOwner: vi.fn(async (): Promise<{ status: number; userId: number } | null> => ({ status: 1, userId: 7 })), adjustBalance: vi.fn(async () => ({ ok: true, balance: 100 })), saveClassified: vi.fn(async () => { throw new Error('save failed'); }), depositUpdate: vi.fn(async () => { throw new Error('save failed'); }), charge: vi.fn(async () => ({ ok: false, balance: 0 })), ad: vi.fn(async () => ({ user_id: 7n, status: 1, data_archive: 'archived', title: 'ad', created_at: new Date(0) })) }));
vi.mock('@/lib/prisma', () => ({ prisma: { ads: { findUnique: mocks.ad }, users: { update: mocks.depositUpdate } } }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7 }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/wallet', () => ({ charge: mocks.charge, adjustBalance: mocks.adjustBalance, buyDupPack: vi.fn() }));
vi.mock('@/lib/settings', () => ({
  getMemberWindows: vi.fn(), withinWindow: vi.fn(), getClassifiedDupConfig: async () => ({ enabled: false }), getServicePricing: async () => ({ featured: { month: 25 }, classified: { month: 25 } }), DUR_DAYS: { month: 30 }, DUR_LABEL: { month: 'month' }, DUP_PACK_COUNT: {}, isDur: (d: string) => d === 'month', getAdRestoreFee: async () => 25,
  getAdExtras: async () => ({ urgentPacks: [{ hours: 24, price: 25 }], bumpFreeDays: 0, bumpPrice: 25 }), getSettingBool: async () => true,
  getTrbhhShowPricing: async () => ({ store: { month: 25 }, ads: [{ key: 'show', price: 25, days: 30, label: 'show' }] }), serviceHasPrice: () => true,
}));
vi.mock('@/lib/packages', () => ({ buyMemberPackage: vi.fn() }));
vi.mock('@/lib/user-location', () => ({ setUserArea: vi.fn() }));
vi.mock('@/lib/sms', () => ({ toLocalSaudi: vi.fn() }));
vi.mock('@/lib/alerts', () => ({ respondToReport: vi.fn() }));
vi.mock('@/lib/content-guard', () => ({ scanContent: vi.fn(), censorGuard: async () => ({ parts: ['title', 'body'], hits: [] }), summarizeHits: vi.fn() }));
vi.mock('@/lib/moderation', () => ({ handleProhibited: vi.fn(), checkFlood: async () => ({ blocked: false }) }));
vi.mock('@/lib/storage', () => ({ saveUpload: vi.fn() }));
vi.mock('@/lib/merchant', () => ({ storeIdOfUser: async () => 3, storeProductAdIds: async () => [42] }));
vi.mock('@/app/ads/actions', () => ({ crossUserDuplicateOf: async () => null }));
vi.mock('@/lib/classified', () => ({ getClassifiedOwnerState: mocks.classifiedOwner, createClassified: mocks.saveClassified }));
vi.mock('@/lib/access-control/guards', () => ({}));
vi.mock('@/lib/nsfw', () => ({ imageModerationEnabled: () => false }));
vi.mock('@/lib/profiles', () => ({ getActiveProfile: async () => ({ id: 2 }) }));
vi.mock('@/lib/commerce/seller-types', () => ({ canMemberSellDirectly: async () => true }));
vi.mock('@/lib/watermark', () => ({}));
vi.mock('@/lib/phash', () => ({}));
import { featureAdAction, buyUrgentAction, bumpAdAction, restoreArchivedAdAction, fundSaleDepositAction } from '@/app/account/actions';
import { buyStoreShowAction, buyAdShowAction } from '@/app/account/company/actions';
import { reactivateClassifiedAction, createClassifiedAction } from '@/app/classified/actions';

describe('purchase action source propagation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not assert an unverified classified target while preserving the existing purchase path', async () => {
    mocks.classifiedOwner.mockResolvedValueOnce(null);
    const form = new FormData(); form.set('id', '42'); form.set('duration', 'month');
    await expect(reactivateClassifiedAction(form)).rejects.toThrow(/needcredit/);
    expect(mocks.charge).toHaveBeenCalledWith(7, 25, 'classified', expect.any(String), { kind: 'operation', id: expect.stringMatching(/^[0-9a-f-]{36}$/), service: 'classified_reactivate' });
  });
  it.each([
    { action: featureAdAction, service: 'featured', kind: 'ad', id: 42n },
    { action: buyUrgentAction, service: 'urgent', kind: 'ad', id: 42n },
    { action: bumpAdAction, service: 'bump', kind: 'ad', id: 42n },
    { action: restoreArchivedAdAction, service: 'ad_show', kind: 'ad', id: 42n },
    { action: buyStoreShowAction, service: 'store_show', kind: 'store', id: 3 },
    { action: buyAdShowAction, service: 'ad_show', kind: 'ad', id: 42 },
    { action: reactivateClassifiedAction, service: 'classified', kind: 'classified', id: 42 },
  ])('passes the exact $kind source for $service from its actual action', async ({ action, service, kind, id }) => {
    const form = new FormData(); for (const [key, value] of Object.entries({ adId: '42', id: '42', duration: 'month', hours: '24', pkg: 'show' })) form.set(key, value);
    await expect(action(form)).rejects.toThrow(/needcredit|error=needcredit/);
    expect(mocks.charge).toHaveBeenCalledTimes(1);
    expect(mocks.charge).toHaveBeenCalledWith(7, 25, service, expect.any(String), { kind, id, service });
  });
});

describe('new operation attempts carry the same source through existing failure refunds', () => {
  it.each([
    { action: createClassifiedAction, reason: 'classified', service: 'classified_publish', error: 'error=save' },
    { action: fundSaleDepositAction, reason: 'member_service', service: 'sale_deposit', error: 'depositerr=failed' },
  ])('links $service debit and failure refund without changing the amounts', async ({ action, reason, service, error }) => {
    vi.clearAllMocks(); mocks.charge.mockResolvedValueOnce({ ok: true, balance: 75 });
    const form = new FormData(); for (const [key, value] of Object.entries({ title: 'title', body: 'body', phone: '0500000000', duration: 'month', amountSar: '25' })) form.set(key, value);
    await expect(action(form)).rejects.toThrow(error);
    expect(mocks.charge).toHaveBeenCalledTimes(1);
    const debit = mocks.charge.mock.calls[0] as unknown as [number, number, string, string, { kind: string; id: string; service: string }];
    expect(debit.slice(0, 3)).toEqual([7, 25, reason]);
    expect(debit[4]).toEqual({ kind: 'operation', id: expect.stringMatching(/^[0-9a-f-]{36}$/), service });
    expect(mocks.adjustBalance).toHaveBeenCalledWith(7, 25, 'refund', expect.objectContaining({ sourceReference: debit[4] }));
  });
});
