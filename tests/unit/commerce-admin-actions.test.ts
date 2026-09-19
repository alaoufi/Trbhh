import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ gate: vi.fn(), schema: vi.fn(), transaction: vi.fn(), gateway: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/roles', () => ({ requireAction: state.gate }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: state.transaction } }));
vi.mock('@/lib/commerce/schema', () => ({ assertCommerceSchemaReady: state.schema }));
vi.mock('@/lib/commerce/runtime', () => ({ getCommerceGateway: state.gateway }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: vi.fn() }));
vi.mock('@/lib/commerce/notifications', () => ({ dispatchPaidNotification: state.dispatch }));
vi.mock('@/lib/sms', () => ({ getMessagingConfig: vi.fn(), sendSms: vi.fn(), sendWhatsApp: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { saveCommerceProduct, saveCommerceSettings, deliverCommerceNotification } from '@/app/admin/commerce/actions';

describe('commerce admin request authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each([saveCommerceProduct, saveCommerceSettings, deliverCommerceNotification])('rejects unauthorized actions before DB changes or messaging', async action => {
    state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(action(new FormData())).rejects.toThrow('forbidden');
    expect(state.transaction).not.toHaveBeenCalled(); expect(state.dispatch).not.toHaveBeenCalled();
  });
  it('requires independent add versus edit privileges, not ads:edit', async () => {
    state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(saveCommerceProduct(new FormData())).rejects.toThrow();
    expect(state.gate).toHaveBeenLastCalledWith('commerce', 'add');
    const edit = new FormData(); edit.set('id', '1'); state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(saveCommerceProduct(edit)).rejects.toThrow();
    expect(state.gate).toHaveBeenLastCalledWith('commerce', 'edit');
  });
  it('cannot enable payment just by toggling a setting without a verified adapter', async () => {
    state.gate.mockResolvedValueOnce({ uid: 1 }); state.schema.mockResolvedValueOnce(undefined); state.gateway.mockResolvedValueOnce(null);
    const fd = new FormData(); fd.set('commerce_payments_enabled', '1');
    await expect(saveCommerceSettings(fd)).rejects.toThrow('gateway_unverified');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('requires an explicit per-message confirmation before actual sending', async () => {
    state.gate.mockResolvedValueOnce({ uid: 1 });
    await expect(deliverCommerceNotification(new FormData())).rejects.toThrow('confirm');
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
