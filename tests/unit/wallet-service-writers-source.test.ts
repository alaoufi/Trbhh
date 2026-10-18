import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  stores: { findUnique: vi.fn(async () => ({ user_id: 7, sub_until: null })), update: vi.fn(async () => ({})) },
  users: { findUnique: vi.fn(async () => ({ balance: 75 })), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({ balance: 85 })) },
  wallet_txns: { create: vi.fn(async () => ({ id: 9n })) },
  member_service_orders: { findFirst: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) },
  $queryRaw: vi.fn(async () => [{ id: 3n }]), $executeRaw: vi.fn(async () => 1),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/merchant', () => ({ getActiveStoreId: async () => 3 }));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: async () => ({ enabled: true }), subPlanPrice: () => 25, SUB_PLAN_MONTHS: { monthly: 1 }, SUB_PLAN_LABELS: { monthly: 'monthly' }, getSettingBool: async () => true, SETTING_MEMBER_SERVICE_CANCEL_ENABLED: 'cancel', SETTING_MEMBER_SERVICE_REFUND_ENABLED: 'refund' }));
import { subscribeStore } from '@/lib/subscription';
import { acceptMemberServiceOrder, cancelMemberServiceOrder } from '@/lib/member-services';
describe('service writers propagate exact operational sources', () => {
  beforeEach(() => vi.clearAllMocks());
  it('records the actual owned store on subscription wallet create', async () => {
    expect((await subscribeStore(7, 'monthly')).ok).toBe(true);
    expect(db.wallet_txns.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: 'svc:v1:store:3:subscription' }) });
  });
  const order = () => ({ id: 42n, user_id: 7n, admin_id: 1n, title: 'service', amount: 25, accept_until: new Date(Date.now() + 86400000), starts_at: new Date(Date.now() - 86400000), ends_at: new Date(Date.now() + 86400000), allow_member_cancel: 1, allow_member_refund: 1, refund_txn_id: null });
  it('preserves the existing claimed acceptance and exact order source', async () => {
    db.member_service_orders.findFirst.mockResolvedValueOnce({ ...order(), status: 'pending_acceptance' });
    expect((await acceptMemberServiceOrder(42, 7)).ok).toBe(true);
    expect(db.wallet_txns.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: 'svc:v1:member_service_order:42:member_service' }) });
    expect(db.member_service_orders.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ debit_txn_id: 9n }) }));
  });
  it('records the same order on its existing prorated refund', async () => {
    db.member_service_orders.findFirst.mockResolvedValueOnce({ ...order(), status: 'active' });
    expect((await cancelMemberServiceOrder(42, 7)).ok).toBe(true);
    expect(db.wallet_txns.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 12, reason: 'refund', money_ref: 'svc:v1:member_service_order:42:member_service' }) });
    expect(db.member_service_orders.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ refund_txn_id: 9n }) }));
  });
  it('does not create money records when the existing operation claim fails', async () => {
    db.member_service_orders.findFirst.mockResolvedValueOnce({ ...order(), status: 'pending_acceptance' });
    db.member_service_orders.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await acceptMemberServiceOrder(42, 7)).ok).toBe(false);
    expect(db.wallet_txns.create).not.toHaveBeenCalled();
  });
});
