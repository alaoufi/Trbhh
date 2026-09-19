import { describe, expect, it, vi } from 'vitest';
import { reconcileCommerceOrder } from '@/lib/commerce/reconcile';
import type { CommerceDb } from '@/lib/commerce/types';
import type { CommerceGateway } from '@/lib/commerce/gateway';
const settlement = vi.hoisted(() => vi.fn().mockResolvedValue({ orderId: 1n, alreadyPaid: false }));
vi.mock('@/lib/commerce/orders', async importOriginal => ({ ...await importOriginal<object>(), settleVerifiedPayment: settlement }));
const row = { id: 2n, order_id: 1n, provider: 'fixture', provider_ref: 'ref1', redirect_url: null, merchant_order_id: 'commerce:1', amount_minor: 1025, currency: 'SAR', status: 'pending' };
const evidence = { provider: 'fixture', reference: 'ref1', merchantOrderId: 'commerce:1', amountMinor: 1025, currency: 'SAR', verified: true, status: 'paid' };
const gateway = (): CommerceGateway => ({ id: 'fixture', ready: true, create: vi.fn(), isSafeRedirect: () => false, verify: vi.fn().mockResolvedValue(evidence) });
describe('server-only owned payment reconciliation', () => {
  it('does not query a gateway if the owned order has no bound reference', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as CommerceDb, adapter = gateway();
    expect((await reconcileCommerceOrder(db, { memberId: 7n, orderId: 1n }, adapter, [])).status).toBe('action_required');
    expect(adapter.verify).not.toHaveBeenCalled(); expect(adapter.create).not.toHaveBeenCalled();
  });
  it('settles only after server inquiry with matching evidence', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([row]) } as unknown as CommerceDb, adapter = gateway();
    expect((await reconcileCommerceOrder(db, { memberId: 7n, orderId: 1n }, adapter, [])).status).toBe('paid');
    expect(adapter.create).not.toHaveBeenCalled();
  });
  it('does not settle a different valid order accidentally returned by the gateway', async () => {
    settlement.mockClear();
    const db = { $queryRaw: vi.fn().mockResolvedValue([row]) } as unknown as CommerceDb, adapter = gateway();
    vi.mocked(adapter.verify).mockResolvedValue({ ...evidence, merchantOrderId: 'commerce:999', reference: 'ref999' });
    expect((await reconcileCommerceOrder(db, { memberId: 7n, orderId: 1n }, adapter, [])).status).toBe('action_required');
    expect(settlement).not.toHaveBeenCalled();
  });
});
