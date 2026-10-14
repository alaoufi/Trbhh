import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ stores: [] as Record<string, unknown>[], owners: [] as Record<string, unknown>[], where: vi.fn(), membership: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: async () => ({ enabled: true, graceDays: 0 }), getStoreShield: async () => true }));
vi.mock('@/lib/store-subscription-access', () => ({ publicStoreWhere: () => ({ status: 1, subscriptionGate: true }) }));
vi.mock('@/lib/moderation', () => ({ storeHiddenByBanState: (ban: number) => ban === 1 }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  stores: { findMany: async (options: unknown) => { state.where(options); return state.stores; } },
  users: { findMany: async () => state.owners },
  store_products: { findMany: state.membership },
} }));
import { catalogStores, catalogStoreAdIds } from '@/lib/cj/catalog-stores';
beforeEach(() => { vi.clearAllMocks(); state.stores = [{ id: 7n, user_id: 20, store_name: 'المتجر الأول' }, { id: 8n, user_id: 20, store_name: 'المتجر الثاني' }, { id: 9n, user_id: 21, store_name: 'محظور' }]; state.owners = [{ id: 20n, name: 'المالك', ban: 0 }, { id: 21n, name: 'محظور', ban: 1 }]; state.membership.mockResolvedValue([{ ad_id: 42 }]); });
describe('catalog actual store identities', () => {
  it('uses directory subscription/status and owner moderation gates, retaining separate stores of one owner', async () => {
    expect(await catalogStores()).toEqual([{ id: 7, name: 'المتجر الأول' }, { id: 8, name: 'المتجر الثاني' }]);
    expect(state.where.mock.calls[0][0].where).toEqual({ status: 1, subscriptionGate: true });
    expect(state.where.mock.calls[0][0]).not.toHaveProperty('take');
  });
  it('queries exact store_products membership, never all ads belonging to the owner', async () => {
    expect(await catalogStoreAdIds(8)).toEqual([42n]);
    expect(state.membership).toHaveBeenCalledWith({ where: { store_id: 8 }, select: { ad_id: true } });
  });
  it('does not query membership for banned or unavailable stores', async () => {
    expect(await catalogStoreAdIds(9)).toEqual([]); expect(await catalogStoreAdIds(999)).toEqual([]);
    expect(state.membership).not.toHaveBeenCalled();
  });
});
