import { describe, expect, it, vi } from 'vitest';
const now = new Date('2026-09-10T12:00:00Z');
const rows = [
  { id: 1n, user_id: 11, status: 1, sub_until: new Date('2026-01-01'), home_featured: 1, show_on_platform: 1, show_until: null, store_name: 'منتهي' },
  { id: 2n, user_id: 12, status: 1, sub_until: new Date('2026-09-11'), home_featured: 1, show_on_platform: 0, show_until: null, store_name: 'معتمد' },
  { id: 3n, user_id: 13, status: 0, sub_until: new Date('2026-09-11'), home_featured: 1, show_on_platform: 1, show_until: null, store_name: 'مراجعة' },
];
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (value as Record<string, unknown>[]).every((p) => matches(row, p));
    if (key === 'OR') return (value as Record<string, unknown>[]).some((p) => matches(row, p));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, bound]) => op === 'gte' ? row[key] !== null && Number(row[key]) >= Number(bound) : op === 'gt' ? row[key] !== null && Number(row[key]) > Number(bound) : true);
    }
    return row[key] === value;
  });
}
vi.mock('@/lib/prisma', () => ({ prisma: {
  stores: { findMany: vi.fn(async ({ where = {} }) => rows.filter((r) => matches(r, where))) },
  users: { findUnique: vi.fn(async () => ({ name: 'صاحب المتجر' })) },
} }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: async () => ({ enabled: true, graceDays: 3 }), getStoreShield: async () => true }));
vi.mock('@/lib/redis', () => ({ cached: async (_key: string, _ttl: number, fn: () => unknown) => fn() }));
vi.mock('@/lib/moderation', () => ({ storeHiddenByBanState: () => false }));
import { approvedStoreIds, homeFeaturedOwnerIds, homeFeaturedStores } from '@/lib/merchant';
import { getStores } from '@/lib/stores';

describe('store public query integration', () => {
  it('does not let an administrative home placement grant bypass expired subscription', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect(await homeFeaturedOwnerIds()).toEqual([12]);
    expect((await homeFeaturedStores()).map((s) => s.storeId)).toEqual([2]);
  });
  it('uses the same subscription and approval gate in directory lists and ID counts', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect(await approvedStoreIds()).toEqual(new Set([2]));
    expect((await getStores()).map((s) => s.id)).toEqual([2]);
  });
});
