import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(async (query: string) => query.includes('FROM packages') ? [{ id: 6, name: 'package', price: 25, duration_days: 30 }] : []),
  $executeRawUnsafe: vi.fn(async () => 1),
  users: { findUnique: vi.fn(async () => ({ balance: 75 })) },
  wallet_txns: { create: vi.fn(async () => ({})) },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
import { buyMemberPackage } from '@/lib/packages';
describe('package operational reference', () => {
  it('records the selected persisted package ID on its existing atomic wallet write', async () => {
    expect(await buyMemberPackage(7, 6)).toEqual({ ok: true, balance: 75 });
    expect(db.wallet_txns.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: 'svc:v1:package:6:subscription' }) });
  });
});
