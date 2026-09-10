import { describe, expect, it, vi } from 'vitest';
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { account_links: { findUnique: async () => ({ group_id: 1n }) } } }));
vi.mock('@/lib/login-core', () => ({ verifyLogin: async (_identifier: string, _password: string, factor: string) => factor === '654321' ? { ok: true, uid: 8, name: 'Linked' } : { ok: false, error: 'factor required' } }));
import { verifyAndLinkOwn } from '@/lib/account-links';
describe('linking an MFA-enrolled account', () => {
  it('forwards the supplied factor to the shared login verifier', async () => {
    expect(await verifyAndLinkOwn(7, 'member', 'correct password', '654321')).toEqual({ ok: true, name: 'Linked' });
  });
});
