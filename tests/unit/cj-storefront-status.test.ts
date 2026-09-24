import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as { id: bigint; status: string; hidden: number; availability_json:string|null; availability_checked_at:Date|null }[], read: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.read } }));
import { getStorefrontCjProduct, listStorefrontCjProducts } from '@/lib/cj/mapping';

beforeEach(() => {
  state.rows = [
    { id: 1n, status: 'draft', hidden: 0, availability_json:null,availability_checked_at:null }, { id: 2n, status: 'ready', hidden: 0, availability_json:JSON.stringify({checkedAt:new Date().toISOString(),stockQuantity:4,shippingOptions:[{name:'Fixture shipping',priceUsd:1,deliveryDays:'test'}]}),availability_checked_at:new Date() },
    { id: 3n, status: 'quarantined', hidden: 0, availability_json:null,availability_checked_at:null }, { id: 4n, status: 'deleted', hidden: 0, availability_json:null,availability_checked_at:null },
    { id: 5n, status: 'unrecognized', hidden: 0, availability_json:null,availability_checked_at:null }, { id: 6n, status: '', hidden: 0, availability_json:null,availability_checked_at:null },
    { id: 7n, status: 'ready', hidden: 1, availability_json:null,availability_checked_at:null },
  ];
  state.read.mockReset();
  // Interpret the small SELECT predicate subset over fixtures, before LIMIT.
  state.read.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?');
    let rows = state.rows.filter(row => !sql.includes('hidden=0') || row.hidden === 0);
    const exact = sql.match(/status='([^']+)'/);
    const membership = sql.match(/status\s+IN\s*\(([^)]+)\)/i);
    if (exact) rows = rows.filter(row => row.status === exact[1]);
    if (membership) { const allowed = [...membership[1].matchAll(/'([^']+)'/g)].map(match => match[1]); rows = rows.filter(row => allowed.includes(row.status)); }
    if (sql.includes('WHERE id=?')) rows = rows.filter(row => row.id === values[0]);
    if (sql.includes('ORDER BY id DESC')) rows = [...rows].sort((a, b) => Number(b.id - a.id));
    return rows.slice(0, sql.includes('LIMIT ?') ? Number(values.at(-1)) : 1);
  });
});

describe('saved CJ detail and related-product visibility', () => {
  it.each([3, 4, 5, 6])('private direct detail rejects unapproved status on product %i', async id => {
    expect(await getStorefrontCjProduct(id, false)).toBeNull();
  });
  it.each([1, 2])('private direct detail retains draft/ready product %i', async id => {
    expect((await getStorefrontCjProduct(id, false))?.id).toBe(BigInt(id));
  });
  it('filters invalid statuses before related-product ordering and limit', async () => {
    expect((await listStorefrontCjProducts(false, 1)).map(row => row.id)).toEqual([2n]);
    expect((await listStorefrontCjProducts(false, 24)).map(row => row.id)).toEqual([2n, 1n]);
  });
  it('never makes a hidden ready product available privately', async () => {
    expect(await getStorefrontCjProduct(7, false)).toBeNull();
  });
  it('preserves the stricter ready-only public branches', async () => {
    expect(await getStorefrontCjProduct(1, true)).toBeNull();
    expect((await getStorefrontCjProduct(2, true))?.id).toBe(2n);
    expect((await listStorefrontCjProducts(true, 24)).map(row => row.id)).toEqual([2n]);
  });
});
