import { describe, it, expect, vi } from 'vitest';
const rows = [
 { id: 1n, user_id: 8, store_name: 'تجربة', status: 0, sub_until: new Date('2099-01-01'), on_trial: 1, created_at: null },
 { id: 2n, user_id: 9, store_name: 'منتهي', status: 1, sub_until: new Date('2000-01-01'), on_trial: 0, created_at: null },
];
vi.mock('@/lib/prisma', () => ({ prisma: {
 stores: { findMany: vi.fn(async ({ where }: { where: { status: number } }) => rows.filter(r => r.status === where.status)) },
 users: { findMany: async () => [{ id: 8n, name: 'عضو', userName: null }] },
} }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/redis', () => ({ cached: async (_k: string, _ttl: number, fn: () => unknown) => fn() }));
import { getPendingStores } from '@/lib/merchant';
describe('store moderation tasks', () => {
 it('explains real moderation with a member financial link and never adds an approved expired store', async () => {
  const pending = await getPendingStores();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ userId: 8, reason: expect.stringContaining('اعتماد'), action: expect.stringContaining('راجع'), financialHref: '/admin/users/8#wallet' });
 });
});
