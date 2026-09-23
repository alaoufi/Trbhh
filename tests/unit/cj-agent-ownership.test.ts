import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ agent: vi.fn(), product: vi.fn(), count: vi.fn(), update: vi.fn(), conditional: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  cj_agents: { findUnique: state.agent, updateMany: state.conditional },
  cj_products: { findUnique: state.product, count: state.count, update: state.update, updateMany: state.conditional },
  $transaction: state.transaction,
} }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 9 }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw Error('redirect:' + path); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { claimProduct, releaseProduct, updateAgentContact } from '@/lib/cj/agents';
import { releaseProductAction, updateMyAgentContactAction } from '@/app/account/agent/actions';
const transaction = { $queryRaw: state.lock, cj_products: { findUnique: state.product, count: state.count, updateMany: state.conditional }, cj_agents: { updateMany: state.conditional } };
beforeEach(() => {
  vi.clearAllMocks(); state.agent.mockResolvedValue({ user_id: 9n, active: 1, weekly_quota: 3 }); state.lock.mockResolvedValue([{ user_id: 9n, active: 1, weekly_quota: 3 }]);
  state.product.mockResolvedValue({ agent_user_id: null, status: 'ready', hidden: 0, image: 'https://example.test/photo.jpg' }); state.count.mockResolvedValue(0);
  state.update.mockResolvedValue({}); state.conditional.mockResolvedValue({ count: 1 }); state.transaction.mockImplementation(async (run: (tx: typeof transaction) => unknown) => run(transaction));
});
describe('agent claims preserve current eligibility and ownership', () => {
  it.each([{ status: 'draft' }, { hidden: 1 }, { image: '' }])('rejects an unavailable product %j before updating', async change => {
    state.product.mockResolvedValue({ agent_user_id: null, status: 'ready', hidden: 0, image: 'image.jpg', ...change });
    expect(await claimProduct(9, 4)).toEqual({ ok: false, error: 'not_found' }); expect(state.update).not.toHaveBeenCalled(); expect(state.conditional).not.toHaveBeenCalled();
  });
  it('locks the agent before counting quota and claims only a still eligible unowned row', async () => {
    expect(await claimProduct(9, 4)).toEqual({ ok: true }); expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.lock.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(state.lock.mock.invocationCallOrder[0]).toBeLessThan(state.count.mock.invocationCallOrder[0]);
    expect(state.conditional).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4n, agent_user_id: null, status: 'ready', hidden: 0, NOT: { image: '' } } })); expect(state.update).not.toHaveBeenCalled();
  });
  it('does not overwrite a product claimed by a competing agent after the read', async () => {
    state.conditional.mockResolvedValue({ count: 0 }); expect(await claimProduct(9, 4)).toEqual({ ok: false, error: 'taken' }); expect(state.update).not.toHaveBeenCalled();
  });
  it('fails closed when the quota query fails', async () => {
    state.count.mockRejectedValue(Error('database_unavailable')); await expect(claimProduct(9, 4)).rejects.toThrow('database_unavailable'); expect(state.update).not.toHaveBeenCalled(); expect(state.conditional).not.toHaveBeenCalled();
  });
  it('rejects deactivated agents and a full quota without any product write', async () => {
    state.lock.mockResolvedValue([{ user_id: 9n, active: 0, weekly_quota: 3 }]);
    expect(await claimProduct(9, 4)).toEqual({ ok: false, error: 'not_agent' });
    state.lock.mockResolvedValue([{ user_id: 9n, active: 1, weekly_quota: 3 }]); state.count.mockResolvedValue(3);
    expect(await claimProduct(9, 4)).toEqual({ ok: false, error: 'quota_full' }); expect(state.conditional).not.toHaveBeenCalled();
  });
  it('does not reset the original claim date when an owner repeats a request', async () => {
    state.product.mockResolvedValue({ agent_user_id: 9n, status: 'ready', hidden: 0, image: 'image.jpg' });
    expect(await claimProduct(9, 4)).toEqual({ ok: true }); expect(state.count).not.toHaveBeenCalled(); expect(state.conditional).not.toHaveBeenCalled();
  });
  it('releasing after reassignment cannot clear another owner', async () => {
    state.conditional.mockResolvedValue({ count: 0 });
    expect(await releaseProduct(9, 4)).toEqual({ ok: false, error: 'not_yours' });
    expect(state.conditional).toHaveBeenCalledWith({ where: { id: 4n, agent_user_id: 9n }, data: { agent_user_id: null, agent_claimed_at: null } });
    const form = new FormData(); form.set('id', '4');
    await expect(releaseProductAction(form)).rejects.toThrow('redirect:/account/agent?err=not_yours');
    expect(state.update).not.toHaveBeenCalled();
  });
  it('a deactivated agent cannot release product assignments', async () => {
    state.lock.mockResolvedValue([{ user_id: 9n, active: 0, weekly_quota: 3 }]);
    expect(await releaseProduct(9, 4)).toEqual({ ok: false, error: 'not_agent' }); expect(state.conditional).not.toHaveBeenCalled();
  });
  it('contact changes never restore an old activation, quota, or notes', async () => {
    expect(await updateAgentContact(9, ' 0500000000 ', ' 966500000000 ')).toBe(true);
    expect(state.conditional).toHaveBeenCalledWith({ where: { user_id: 9n, active: 1 }, data: { phone: '0500000000', whatsapp: '966500000000' } });
    state.conditional.mockResolvedValue({ count: 0 }); const form = new FormData(); form.set('phone', '0500000000');
    await expect(updateMyAgentContactAction(form)).rejects.toThrow('redirect:/account/agent?err=not_agent');
  });
});
