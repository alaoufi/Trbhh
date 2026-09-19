import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ad: vi.fn(), store: vi.fn(), meta: vi.fn(), products: vi.fn(), partners: vi.fn(),
  session: vi.fn(), admin: vi.fn(), sub: vi.fn(), ban: vi.fn(),
  storeRow: vi.fn(), adRow: vi.fn(), ownerRow: vi.fn(), settings: vi.fn(), membership: vi.fn(),
}));
vi.mock('@/lib/data', () => ({ getAd: m.ad, recordView: async () => {} }));
vi.mock('@/lib/stores', () => ({ getStore: m.store }));
vi.mock('@/lib/merchant', () => ({ getStoreMeta: m.meta, storeProductAdIds: m.products, collaboratorAds: m.partners, storeIdByHandle: async () => 1 }));
vi.mock('@/lib/auth', () => ({ getSession: m.session }));
vi.mock('@/lib/roles', () => ({ hasAnyAdmin: m.admin }));
vi.mock('@/lib/subscription', () => ({ isStoreSubBlocked: m.sub }));
vi.mock('@/lib/moderation', async (original) => ({ ...await original<object>(), storeHiddenByOwnerBan: m.ban }));
vi.mock('@/lib/prisma', () => ({ prisma: { stores: { findUnique: m.storeRow }, ads: { findUnique: m.adRow }, users: { findUnique: m.ownerRow }, site_settings: { findMany: m.settings }, store_products: { findFirst: m.membership } } }));
vi.mock('@/app/account/actions', () => ({ deleteAdAction: vi.fn(), archiveAdAction: vi.fn(), restoreArchivedAdAction: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, useRouter: vi.fn(), usePathname: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/ad-media', () => ({ getAdAudio: async () => null }));
vi.mock('@/lib/store-extras', () => ({ stockEnabled: async () => false, dealsEnabled: async () => false }));
vi.mock('@/lib/settings', () => ({ parseTemplates: () => [], fillTemplate: () => '', SETTING_SUB_ENABLED: 'sub_store_enabled', SETTING_SUB_GRACE_DAYS: 'sub_grace_days', SETTING_STORE_SHIELD: 'store_shield_on' }));
import Page, { generateMetadata } from '@/app/companies/[id]/p/[adId]/page';

const params = () => ({ params: Promise.resolve({ id: '1', adId: '7' }) });
beforeEach(() => {
  vi.resetAllMocks();
  m.ad.mockResolvedValue({ id: 7, title: 'PRIVATE_TITLE', detail: 'PRIVATE_DETAIL', images: ['/private.jpg'], status: 1, state: 'active', archived: false, storeOnly: true, price: 0, seller: { id: 2 } });
  m.store.mockResolvedValue({ id: 1, userId: 2, name: 'store', logo: '/logo.png' });
  m.meta.mockResolvedValue({ status: 1, storeName: 'store' });
  m.products.mockResolvedValue([7]); m.partners.mockResolvedValue([]);
  m.membership.mockResolvedValue({ ad_id: 7 });
  m.session.mockResolvedValue(null); m.admin.mockResolvedValue(false);
  m.sub.mockResolvedValue(false); m.ban.mockResolvedValue(false);
  m.storeRow.mockResolvedValue({ user_id: 2, status: 1, sub_until: null });
  m.adRow.mockResolvedValue({ status: 1, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null });
  m.ownerRow.mockResolvedValue({ ban: null, ban_until: null, ban_source: null });
  m.settings.mockResolvedValue([{ k: 'sub_store_enabled', v: '1' }, { k: 'sub_grace_days', v: '10' }, { k: 'store_shield_on', v: '0' }]);
});
describe('store product page and metadata access', () => {
  it('keeps eligible store-only products public without platform entitlement', async () => {
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
    expect(await Page(params())).toBeTruthy();
  });
  it.each([
    { status: 0 }, { state: 'hidden' }, { data_archive: '2026-01-01' },
    { paused_by_owner: 1 }, { publish_at: new Date('2999-01-01') },
  ])('denies guest page and metadata for hidden ad %j', async (patch) => {
    m.adRow.mockResolvedValue({ status: 1, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null, ...patch });
    m.ad.mockResolvedValue({ ...(await m.ad()), ...patch, archived: !!patch.data_archive });
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it('never exposes an unrelated ad in metadata, even to an admin', async () => {
    m.products.mockResolvedValue([]); m.membership.mockResolvedValue(null); m.session.mockResolvedValue({ uid: 9 }); m.admin.mockResolvedValue(true);
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it.each(['owner', 'admin'])('allows %s inspection but never private metadata', async (role) => {
    m.session.mockResolvedValue({ uid: role === 'owner' ? 2 : 9 }); m.admin.mockResolvedValue(role === 'admin');
    m.adRow.mockResolvedValue({ status: 0, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null });
    m.ad.mockResolvedValue({ ...(await m.ad()), status: 0 });
    expect(await Page(params())).toBeTruthy();
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
  });
  it.each(['approval', 'subscription', 'ban'])('applies store %s to page and metadata', async (rule) => {
    if (rule === 'approval') { m.meta.mockResolvedValue({ status: 0 }); m.storeRow.mockResolvedValue({ user_id: 2, status: 0, sub_until: null }); }
    if (rule === 'subscription') { m.sub.mockResolvedValue(true); m.storeRow.mockResolvedValue({ user_id: 2, status: 1, sub_until: new Date('2000-01-01') }); }
    if (rule === 'ban') { m.ban.mockResolvedValue(true); m.ownerRow.mockResolvedValue({ ban: 'checked', ban_until: null, ban_source: 'admin' }); }
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it.each(['storeRow', 'adRow', 'ownerRow', 'settings'] as const)('fails closed on %s query failure', async (key) => {
    m[key].mockRejectedValue(new Error('DB unavailable'));
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it.each(['0', '-1', '1.5', 'NaN', '9007199254740993', ''])('rejects invalid ad id %j before content reads', async (adId) => {
    const input = { params: Promise.resolve({ id: '1', adId }) };
    expect(JSON.stringify(await generateMetadata(input))).not.toContain('PRIVATE');
    await expect(Page(input)).rejects.toThrow('NOT_FOUND');
    expect(m.ad).not.toHaveBeenCalled();
  });
  it('does not reinterpret a failed direct membership query as collaborator permission', async () => {
    m.membership.mockRejectedValue(new Error('DB unavailable'));
    m.partners.mockResolvedValue([{ id: 7 }]);
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it('allows a publicly displayed collaborator product', async () => {
    m.products.mockResolvedValue([]); m.membership.mockResolvedValue(null); m.partners.mockResolvedValue([{ id: 7 }]);
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
    expect(await Page(params())).toBeTruthy();
  });
  it.each(['0', '-1', '1.5', '9007199254740993', '', 'bad/handle'])('rejects invalid store id %j without content reads', async (id) => {
    const input = { params: Promise.resolve({ id, adId: '7' }) };
    expect(JSON.stringify(await generateMetadata(input))).not.toContain('PRIVATE');
    await expect(Page(input)).rejects.toThrow('NOT_FOUND');
    expect(m.ad).not.toHaveBeenCalled();
  });
  it('uses the same public gate for the guest page independently of metadata', async () => {
    m.adRow.mockResolvedValue({ status: 0, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null });
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
    expect(m.ad).not.toHaveBeenCalled();
  });
  it('suppresses structured product metadata during privileged inspection', async () => {
    m.session.mockResolvedValue({ uid: 2 });
    m.adRow.mockResolvedValue({ status: 0, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null });
    const page = await Page(params());
    expect(page.props.children[0]).toBe(false);
    expect(await generateMetadata(params())).toEqual({ title: 'إعلان', robots: { index: false, follow: false } });
  });
  it.each(['storeRow', 'adRow', 'ownerRow'] as const)('denies missing %s records', async (key) => {
    m[key].mockResolvedValue(null);
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
  it('retains store handles', async () => {
    const input = { params: Promise.resolve({ id: 'my-store', adId: '7' }) };
    expect((await generateMetadata(input)).title).toContain('PRIVATE_TITLE');
    expect(await Page(input)).toBeTruthy();
  });
  it('keeps old ads and past scheduled ads eligible without platform lifecycle checks', async () => {
    m.adRow.mockResolvedValue({ status: 1, state: 'active', data_archive: '', paused_by_owner: 0, publish_at: new Date('2020-01-01') });
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
  });
  it('honors subscription grace', async () => {
    m.storeRow.mockResolvedValue({ user_id: 2, status: 1, sub_until: new Date(Date.now() - 86400000) });
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
  });
  it('honors disabled subscription enforcement and the configured store shield', async () => {
    m.storeRow.mockResolvedValue({ user_id: 2, status: 1, sub_until: new Date('2000-01-01') });
    m.ownerRow.mockResolvedValue({ ban: 'checked', ban_until: null, ban_source: 'admin' });
    m.settings.mockResolvedValue([{ k: 'sub_store_enabled', v: '0' }, { k: 'store_shield_on', v: '1' }]);
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
  });
  it('honors expired bans without lifting or writing them', async () => {
    m.ownerRow.mockResolvedValue({ ban: 'checked', ban_until: new Date('2000-01-01'), ban_source: 'admin' });
    expect((await generateMetadata(params())).title).toContain('PRIVATE_TITLE');
  });
  it('does not grant inspection to an unrelated authenticated member', async () => {
    m.session.mockResolvedValue({ uid: 99 });
    m.adRow.mockResolvedValue({ status: 0, state: 'active', data_archive: null, paused_by_owner: 0, publish_at: null });
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
    expect(m.ad).not.toHaveBeenCalled();
  });
  it('denies collaborator lookup errors', async () => {
    m.products.mockResolvedValue([]); m.membership.mockResolvedValue(null);
    m.partners.mockRejectedValue(new Error('DB unavailable'));
    expect(JSON.stringify(await generateMetadata(params()))).not.toContain('PRIVATE');
    await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  });
});
