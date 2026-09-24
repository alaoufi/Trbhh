import { describe, expect, it, vi } from 'vitest';
const now = new Date('2026-09-10T12:00:00Z');
const rows = [
  { id: 1n, status: 1, sub_until: new Date('2022-01-01'), home_featured: 1, show_on_platform: 1, show_until: null },
  { id: 2n, status: 1, sub_until: new Date('2027-01-01'), home_featured: 1, show_on_platform: 0, show_until: null },
  { id: 3n, status: 1, sub_until: new Date('2027-01-01'), home_featured: 0, show_on_platform: 1, show_until: new Date('2022-01-01') },
  { id: 4n, status: 2, sub_until: new Date('2027-01-01'), home_featured: 1, show_on_platform: 1, show_until: null },
];
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (value as Record<string, unknown>[]).every((p) => matches(row, p));
    if (key === 'OR') return (value as Record<string, unknown>[]).some((p) => matches(row, p));
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, bound]) => {
      if (op === 'in') return (bound as unknown[]).includes(row[key]);
      return op === 'gte' ? row[key] !== null && Number(row[key]) >= Number(bound) : op === 'gt' ? row[key] !== null && Number(row[key]) > Number(bound) : false;
    });
    return row[key] === value;
  });
}
vi.mock('@/lib/prisma', () => ({ prisma: { stores: { findMany: vi.fn(async ({ where,select }) => rows.filter((r) => matches(r, where)).map(r=>({...r,user_id:22n,...(select?.user_id?{user_id:22n}:{})}))) }, users:{findMany:vi.fn(async()=>[{id:22n,trusted:1}])}, ads: { findMany: vi.fn(async ({ where }) => [{ id: 102n, status: 1, state: 'active', data_archive: null }, { id: 103n, status: 0, state: 'active', data_archive: null }, { id: 104n, status: 1, state: 'active', data_archive: '2026-09-01' }, { id: 106n, status: 1, state: 'active', data_archive: null }].filter((row) => matches(row, where))) }, store_products: { findMany: vi.fn(async () => [102, 103, 104, 105].map((ad_id) => ({ store_id: 2, ad_id }))) } } }));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: async () => ({ enabled: true, graceDays: 3 }) }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/redis', () => ({ cached: async (key: string) => key === 'stores:home-ads' ? [101, 102, 103, 104, 105, 106].map((id) => ({ id, storeId: id === 101 ? 1 : 2 })) : [1, 2, 3, 4].map((id) => ({ id })) }));
import { homeFeaturedAds, homeStoreCards } from '@/lib/merchant';

describe('cached public store eligibility', () => {
  it('rechecks subscription, approval and placement entitlement before returning cached store cards', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect((await homeStoreCards()).map((s) => s?.id)).toEqual([2]);
  });
  it('rechecks the same gates for cached product cards', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect((await homeFeaturedAds()).map((ad) => ad.id)).toEqual([102]);
  });
});
