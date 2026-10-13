import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ order: vi.fn(), event: vi.fn(), setting: vi.fn(), create: vi.fn(), pay: vi.fn(), update: vi.fn(), ledger: vi.fn() }));
vi.mock('@/lib/cj/orders/store', () => ({ getOrderById: mock.order, appendOrderEvent: mock.event, parseOrderLines: () => [], transitionOrder: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettingNum: mock.setting }));
vi.mock('@/lib/cj/client', () => ({ createCjOrder: mock.create, payCjOrderBalance: mock.pay, getCjBalance: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { cj_orders: { update: mock.update, updateMany: mock.update } } }));
vi.mock('@/lib/cj/orders/ledger', () => ({ recordLedgerEntry: mock.ledger }));
import { approveAndPayOrder } from '@/lib/cj/orders/payment';
describe('CJ purchase commitment P0 gate', () => {
  beforeEach(() => { vi.clearAllMocks(); mock.order.mockResolvedValue({ internal_ref: 'TRB-1', paid_at: null }); mock.event.mockResolvedValue(true); });
  it.each([{}, { capUsdMinor: 100 }, { capUsdMinor: 99999999, actorId: 3 }])('blocks all approval amounts before any supplier mutation %j', async opts => {
    expect(await approveAndPayOrder(7n, opts)).toMatchObject({ ok: false, reason: 'purchase_unverified' });
    expect(mock.create).not.toHaveBeenCalled(); expect(mock.pay).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled(); expect(mock.ledger).not.toHaveBeenCalled();
    expect(mock.event).toHaveBeenCalledWith(7n, expect.objectContaining({ type: 'cj_purchase_p0_blocked', eventKey: 'TRB-1:purchase:commitment-unverified' }));
  });
  it('does not promote an old paid_at flag to verified purchase success', async () => {
    mock.order.mockResolvedValue({ internal_ref: 'TRB-1', paid_at: new Date(), cj_order_id: 'CJ-1' });
    expect(await approveAndPayOrder(7n)).toMatchObject({ ok: false, reason: 'purchase_unverified' });
    expect(mock.pay).not.toHaveBeenCalled();
  });
  it('returns missing order without any external mutation', async () => { mock.order.mockResolvedValue(null); expect(await approveAndPayOrder(7n)).toEqual({ ok: false, reason: 'not_found' }); expect(mock.event).not.toHaveBeenCalled(); });
  it('audit failure cannot permit payment', async () => { mock.event.mockRejectedValue(new Error('db')); await expect(approveAndPayOrder(7n)).rejects.toThrow('db'); expect(mock.pay).not.toHaveBeenCalled(); });
  it('repeated concurrent requests never create or debit', async () => { const results = await Promise.all([approveAndPayOrder(7n), approveAndPayOrder(7n)]); expect(results.every(r => !r.ok)).toBe(true); expect(mock.pay).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled(); });
});
