import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ charge: vi.fn(async () => ({ ok: true, balance: 75, price: 25 })), update: vi.fn(async () => ({})) }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findUnique: async () => ({ identity_paid_until: null }), update: mocks.update } } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/settings', () => ({ getSetting: async () => 'plan', getSettingNum: async (key: string) => key.endsWith('_acc') ? 2 : 25 }));
vi.mock('@/lib/wallet', () => ({ charge: mocks.charge }));
import { subscribeIdentityPlan } from '@/lib/identity-plans';
describe('identity subscription operation source', () => {
  it('gives each actual purchase attempt its own operational reference, retaining its existing amount and activation', async () => {
    await subscribeIdentityPlan(7, 1, 'month');
    await subscribeIdentityPlan(7, 1, 'month');
    expect(mocks.charge).toHaveBeenCalledTimes(2);
    const first = mocks.charge.mock.calls[0] as unknown as [number, number, string, string, { kind: string; id: string; service: string }];
    const second = mocks.charge.mock.calls[1] as unknown as typeof first;
    expect(first.slice(0, 3)).toEqual([7, 25, 'subscription']);
    expect(first[4]).toEqual({ kind: 'operation', id: expect.stringMatching(/^[0-9a-f-]{36}$/), service: 'identity_subscription' });
    expect(second[4].id).not.toBe(first[4].id);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
