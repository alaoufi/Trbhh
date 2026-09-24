import { beforeEach, describe, expect, it, vi } from 'vitest';
import { platformAdPublicWhere } from '@/lib/platform-ad-visibility';
import { searchCardVisibility } from '@/lib/search-card-visibility';

const state = vi.hoisted(() => ({ staff: true, products: [] as Record<string, unknown>[], ads: [] as Record<string, unknown>[], commerce: [] as { id: string; key: string; imported: boolean }[], linked: [] as bigint[], reads: vi.fn(), trusted: [1n] }));
vi.mock('@/lib/cj/approved-catalog', () => ({
  countApprovedCatalog: async (scope: string) => state.commerce.filter(row => scope !== 'imported' || row.imported).length,
  listApprovedCatalog: async (scope: string, take: number, skip: number) => state.commerce.filter(row => scope !== 'imported' || row.imported).slice(skip, skip + take),
}));
vi.mock('@/lib/cj/storefront', () => ({ cjStorefrontView: async () => ({ isStaff: state.staff, isPublic: true }) }));
vi.mock('@/lib/data', () => ({
  publicAdCardSelect: { id: true },
  publicAdSearchWhere: async () => ({ AND: [platformAdPublicWhere(new Date('2026-09-24'), false), searchCardVisibility({ now: new Date('2026-09-24'), plans: [], subscriptions: [], bannedIds: [9n], defaultDays: 0 })] }),
  toPublicAdCards: async (rows: { id: bigint; title: string }[]) => rows.map(row => ({ id: Number(row.id), title: row.title })),
}));
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (value as Record<string, unknown>[]).every(part => matches(row, part));
    if (key === 'OR') return (value as Record<string, unknown>[]).some(part => matches(row, part));
    if (value === null || typeof value !== 'object') return row[key] === value;
    return Object.entries(value as Record<string, unknown>).every(([op, expected]) => {
      if (op === 'in') return (expected as unknown[]).includes(row[key]);
      if (op === 'notIn') return !(expected as unknown[]).includes(row[key]);
      if (op === 'gt') return row[key] != null && (row[key] as number) > (expected as number);
      if (op === 'lte') return row[key] != null && (row[key] as number) <= (expected as number);
      throw Error(`Unhandled fixture operator ${op}`);
    });
  });
}
function model(rows: () => Record<string, unknown>[]) { return {
  count: async ({ where }: { where: Record<string, unknown> }) => { state.reads(); return rows().filter(row => matches(row, where)).length; },
  findMany: async ({ where, skip = 0, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
    state.reads(); return rows().filter(row => matches(row, where)).sort((a, b) => Number(b.id) - Number(a.id)).slice(skip, take === undefined ? undefined : skip + take);
  },
}; }
vi.mock('@/lib/prisma', () => ({ prisma: {
  cj_products: model(() => state.products), ads: model(() => state.ads),
  users: { findMany: async () => state.trusted.map(id => ({ id })) },
  $queryRaw: async () => { state.reads(); return state.linked.map(ad_id => ({ ad_id })); },
} }));
import { loadCjCatalog, parseCjCatalogQuery } from '@/lib/cj/catalog-feed';

const product = (id: number, changes = {}) => ({ id: BigInt(id), hidden: 0, status: 'draft', name_ar: `CJ ${id}`, ...changes });
const ad = (id: number, changes = {}) => ({ id: BigInt(id), user_id: 2n, title: `Ad ${id}`, status: 1, state: 'active', store_only: 0, trbhh_until: null, data_archive: null, data_delete: null, paused_by_owner: 0, publish_at: null, platform_hidden_at: null, platform_archived_at: null, ...changes });
beforeEach(() => { state.staff = true; state.products = []; state.ads = []; state.commerce = []; state.linked = []; state.reads.mockClear(); });

describe('private CJ mixed catalog', () => {
  it('rejects nonstaff before catalog reads even when the legacy public flag is on', async () => {
    state.staff = false;
    await expect(loadCjCatalog({})).rejects.toThrow('cj_catalog_access_denied');
    expect(state.reads).not.toHaveBeenCalled();
  });
  it.each([{}, { tab: 'unknown', page: '-3' }, { tab: ['imported'], page: ['2'] }, { page: '1e8' }, { page: '0' }])('normalizes invalid URL input %j', query => {
    expect(parseCjCatalogQuery(query)).toEqual({ tab: 'all', page: 1 });
  });
  it('accepts only named tabs and positive bounded integer pages', () => {
    expect(parseCjCatalogQuery({ tab: 'verified', page: '4' })).toEqual({ tab: 'verified', page: 4 });
  });
  it('pages beyond the former sixty-product cap with no duplicates or skipped eligible rows', async () => {
    state.products = Array.from({ length: 65 }, (_, i) => product(i + 1));
    state.ads = Array.from({ length: 50 }, (_, i) => ad(i + 1));
    const keys: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const result = await loadCjCatalog({ page: String(page) });
      expect(result.total).toBe(115); expect(result.pageCount).toBe(5); expect(result.items.length).toBeLessThanOrEqual(24);
      keys.push(...result.items.map(item => item.key));
    }
    expect(keys).toHaveLength(115); expect(new Set(keys).size).toBe(115);
    expect(keys).toContain('cj:1'); expect(keys).toContain('ad:1');
  });
  it('filters imported hidden, quarantined, deleted and unknown statuses before counting and paging', async () => {
    state.products = [product(1), product(2, { status: 'ready' }), product(3, { hidden: 1 }), product(4, { status: 'quarantined' }), product(5, { status: 'deleted' }), product(6, { status: 'unrecognized' })];
    const result = await loadCjCatalog({ tab: 'imported' });
    expect(result.total).toBe(2); expect(result.items.map(item => item.key)).toEqual(['cj:2', 'cj:1']);
  });
  it('preserves public visibility, archive/delete, pause, scheduled, ban and store-isolation gates', async () => {
    state.ads = [ad(1), ad(2, { status: 0 }), ad(3, { state: 'inactive' }), ad(4, { data_archive: 'date' }), ad(5, { data_delete: 'date' }), ad(6, { paused_by_owner: 1 }), ad(7, { publish_at: new Date('2099-01-01') }), ad(8, { user_id: 9n }), ad(9, { store_only: 1 }), ad(10, { platform_hidden_at: new Date() }), ad(11, { platform_archived_at: new Date() }), ad(12, { store_only: 1, trbhh_until: new Date('2099-01-01') })];
    const result = await loadCjCatalog({ tab: 'members' });
    expect(result.total).toBe(2); expect(result.items.map(item => item.key)).toEqual(['ad:12', 'ad:1']);
  });
  it('does not resurface a CJ-linked ad even if its imported source is hidden', async () => {
    state.products = [product(1, { hidden: 1 })]; state.ads = [ad(1), ad(2)]; state.linked = [1n];
    expect((await loadCjCatalog({})).items.map(item => item.key)).toEqual(['ad:2']);
  });
  it('verified means trusted seller, never premium or an admin uploader', async () => {
    state.ads = [ad(1, { user_id: 1n }), ad(2, { adsSpecial: 'checked', tier: 'gold', is_admin: 1 })];
    const result = await loadCjCatalog({ tab: 'verified' });
    expect(result.total).toBe(1); expect(result.items.map(item => item.key)).toEqual(['ad:1']);
  });
  it('clamps out-of-range pages to the real last page', async () => {
    state.products = Array.from({ length: 25 }, (_, i) => product(i + 1));
    const result = await loadCjCatalog({ tab: 'imported', page: '999999999' });
    expect(result.page).toBe(2); expect(result.items.map(item => item.key)).toEqual(['cj:1']);
  });
  it('never infers Trbhh approval from member, paid or administrator ads', async () => {
    state.ads = [ad(1, { is_admin: 1, adsSpecial: 'checked' })];
    expect((await loadCjCatalog({ tab: 'trbhh' })).items).toEqual([]);
  });
  it('pages all three sources exactly once and only puts explicit imported commerce in imported tab', async () => {
    state.products = Array.from({ length: 25 }, (_, i) => product(i + 1));
    state.commerce = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), key: `commerce:${i + 1}`, imported: i < 5 }));
    state.ads = Array.from({ length: 25 }, (_, i) => ad(i + 1));
    const keys: string[] = [];
    for (let page = 1; page <= 4; page++) { const result = await loadCjCatalog({ page: String(page) }); expect(result.total).toBe(75); keys.push(...result.items.map(item => item.key)); }
    expect(keys).toHaveLength(75); expect(new Set(keys).size).toBe(75);
    expect((await loadCjCatalog({ tab: 'imported' })).total).toBe(30);
    expect((await loadCjCatalog({ tab: 'trbhh' })).total).toBe(25);
    expect((await loadCjCatalog({ tab: 'members' })).total).toBe(25);
  });
});
