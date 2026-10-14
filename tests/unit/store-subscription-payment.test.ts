import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ balance: 100, transactions: 0, price: 25 }));
const db = vi.hoisted(() => ({
  stores: { findUnique: vi.fn(async () => ({ user_id: 7, sub_until: null, status: 1, terms_agreed: 1, national_id: '123' })), update: vi.fn(async (_args: unknown) => { throw new Error('storage unavailable'); }), updateMany: vi.fn(async () => { throw new Error('storage unavailable'); }) },
  users: { findUnique: vi.fn(async () => ({ balance: 100 })) },
  wallet_txns: { create: vi.fn(async () => { state.transactions++; }) },
  $queryRaw: vi.fn(async () => [{ id: 3n }]),
  $executeRaw: vi.fn(async () => { state.balance -= 25; return 1; }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => {
  const snapshot = { ...state };
  try { return await fn(db); } catch (error) { Object.assign(state, snapshot); throw error; }
} } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/merchant', () => ({ getActiveStoreId: async () => 3 }));
vi.mock('@/lib/wallet', () => ({ charge: async () => ({ ok: true, price: 25 }) }));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: async () => ({ enabled: true }), subPlanPrice: () => state.price, SUB_PLAN_MONTHS: { monthly: 1 }, getStorePlusPricing: async () => ({ enabled: true }), plusPlanPrice: () => 35, SUB_PLAN_LABELS: { monthly: 'شهري' } }));
import { subscribeStore, buyStorePlus } from '@/lib/subscription';
describe('store subscription atomic activation', () => {
  beforeEach(() => { vi.clearAllMocks(); state.balance = 100; state.transactions = 0; state.price = 25; });
  it('activates a paid entitlement directly while preserving administrative moderation', async () => {
    db.stores.update.mockResolvedValueOnce({} as never);
    const result = await subscribeStore(7, 'monthly');
    expect(result.ok).toBe(true);
    expect(db.wallet_txns.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -25, reason: 'subscription' }) }));
    expect(db.stores.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ on_trial: 0, sub_plan: 'monthly' }) }));
    expect(db.stores.update.mock.calls[0][0]).not.toHaveProperty('data.status');
  });
  it.each([NaN, Infinity, -1, 0.1])('rejects malformed price %s before any transactional write', async (price) => {
    state.price = price;
    expect((await subscribeStore(7, 'monthly')).ok).toBe(false);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.wallet_txns.create).not.toHaveBeenCalled();
  });
  it('keeps a configured free plan free while activating the entitlement', async () => {
    state.price = 0;
    db.stores.update.mockResolvedValueOnce({} as never);
    expect((await subscribeStore(7, 'monthly')).ok).toBe(true);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.wallet_txns.create).not.toHaveBeenCalled();
  });
  it('rolls back the debit if the ledger write fails and never grants entitlement', async () => {
    db.wallet_txns.create.mockRejectedValueOnce(new Error('ledger unavailable'));
    expect((await subscribeStore(7, 'monthly')).ok).toBe(false);
    expect(state.balance).toBe(100);
    expect(db.stores.update).not.toHaveBeenCalled();
  });
  it('does not write a charge or entitlement when usable balance is insufficient', async () => {
    db.$executeRaw.mockResolvedValueOnce(0);
    expect((await subscribeStore(7, 'monthly')).ok).toBe(false);
    expect(db.wallet_txns.create).not.toHaveBeenCalled();
    expect(db.stores.update).not.toHaveBeenCalled();
  });
  it('does not claim Plus activation when storing the bundle fails', async () => {
    expect((await buyStorePlus(7, 'monthly')).ok).toBe(false);
    expect(state).toMatchObject({ balance: 100, transactions: 0 });
  });
  it('refuses a store whose ownership changed before the locked transaction', async () => {
    db.stores.findUnique.mockResolvedValueOnce({ user_id: 99, sub_until: null, status: 1, terms_agreed: 1, national_id: '123' });
    expect((await subscribeStore(7, 'monthly')).ok).toBe(false);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.wallet_txns.create).not.toHaveBeenCalled();
  });
  it('does not report a successful purchase when entitlement persistence fails', async () => {
    expect((await subscribeStore(7, 'monthly')).ok).toBe(false);
    expect(db.stores.update).toHaveBeenCalled();
    expect(state).toMatchObject({ balance: 100, transactions: 0 });
  });
});
