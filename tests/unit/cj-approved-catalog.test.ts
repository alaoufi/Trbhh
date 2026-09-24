import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ staff: true, read: vi.fn(), cards: vi.fn(), adRead: vi.fn() }));
vi.mock('@/lib/cj/storefront', () => ({ cjStorefrontView: async () => ({ isStaff: state.staff, isPublic: true }), cjImg: (url: string) => url, cjProductImages: (row: { image: string }) => row.image ? [row.image] : [] }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.read, ads: { findMany: state.adRead } } }));
vi.mock('@/lib/data', () => ({ publicAdSearchWhere: async () => ({ status: 1, state: 'active' }), publicAdCardSelect: { id: true }, toPublicAdCards: state.cards }));
import { approvedCatalogScope, countApprovedCatalog, listApprovedCatalog, getApprovedPreview } from '@/lib/cj/approved-catalog';

const row = (changes = {}) => ({ id: 12n, ad_id: null, title: 'سلعة معتمدة', price_minor: 12345, stock_available: 3, description: '<p>وصف محفوظ</p>', images: ['https://cdn.salla.sa/product.jpg'], supplier_product_id: 2n, cj_image: null, cj_images: null, ...changes });
beforeEach(() => { state.staff = true; vi.clearAllMocks(); state.read.mockResolvedValue([]); state.adRead.mockResolvedValue([]); state.cards.mockResolvedValue([]); });

describe('approved products private display', () => {
  it('rejects nonstaff before reading a product even with the old public flag', async () => {
    state.staff = false; await expect(getApprovedPreview('12')).rejects.toThrow('cj_catalog_access_denied'); expect(state.read).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1e2', '01', '12 OR 1=1', '1'.repeat(17)])('rejects malformed product id %s without a query', async id => {
    expect(await getApprovedPreview(id)).toBeNull(); expect(state.read).not.toHaveBeenCalled();
  });
  it('uses approval, visibility and all source eligibility gates in the common scope before count or paging', () => {
    const sql = approvedCatalogScope('trbhh').sql;
    for (const predicate of ['cp.approved=1', 'cp.visible=1', 'cp.enabled=1', "cp.currency='SAR'", 'sp.active=1', 'sp.visible=1', 'sp.available=1', 'sp.quantity>0', "sp.sync_error=''", 's.active=1', 'sip.maintenance=0', "sc.status='connected'", "sc.provider='salla'", "sip.provider='salla'", 'sc.oauth_scope_version=', 'sc.encrypted_tokens IS NOT NULL', 'sc.supplier_id=sp.supplier_id', 'cj.hidden<>0', "cj.status NOT IN ('draft','ready')"]) expect(sql).toContain(predicate);
    expect(sql).not.toContain('is_admin'); expect(sql).not.toContain('adsSpecial');
  });
  it('excludes all CJ commerce representations from all/imported, and requires import evidence only for imported tab', () => {
    expect(approvedCatalogScope('all').sql).toContain('NOT EXISTS (SELECT 1 FROM cj_products cj_source');
    expect(approvedCatalogScope('imported').sql).toContain('sp.id IS NOT NULL');
    expect(approvedCatalogScope('trbhh').sql).not.toContain('cj_source');
  });
  it('binds list offsets and product ids, and uses the identical shared scope for count/list/detail', async () => {
    state.read.mockResolvedValueOnce([{ total: 3n }]).mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);
    expect(await countApprovedCatalog('all')).toBe(3);
    expect((await listApprovedCatalog('all', 24, 48))[0].key).toBe('commerce:12');
    expect((await getApprovedPreview('12'))?.priceMinor).toBe(12345);
    const [count, list, detail] = state.read.mock.calls.map(([query]) => query);
    expect(count.sql).toContain(approvedCatalogScope('all').sql);
    expect(list.sql).toContain(approvedCatalogScope('all').sql);
    expect(detail.sql).toContain(approvedCatalogScope('trbhh').sql);
    expect(list.values.slice(-2)).toEqual([24, 48]); expect(detail.values.at(-1)).toBe(12n);
  });
  it('returns display fields only and keeps financial/vendor metadata out of the preview', async () => {
    state.read.mockResolvedValue([row({ unit_cost_minor: 1, profit_minor: 12344, encrypted_tokens: 'sentinel-private' })]);
    const product = await getApprovedPreview('12');
    expect(product).toEqual({ id: '12', key: 'commerce:12', title: 'سلعة معتمدة', priceMinor: 12345, stock: 3, images: ['https://cdn.salla.sa/product.jpg'], description: '<p>وصف محفوظ</p>', imported: true, href: '/cj/approved/12' });
    expect(JSON.stringify(product)).not.toContain('sentinel');
  });
  it('does not fetch images from an ineligible linked member ad', async () => {
    state.read.mockResolvedValue([row({ ad_id: 99n, images: null, supplier_product_id: null })]);
    const product = await getApprovedPreview('12');
    expect(product?.images).toEqual([]); expect(state.cards).not.toHaveBeenCalled();
    expect(state.adRead.mock.calls[0][0].where.AND).toContainEqual({ status: 1, state: 'active' });
  });
  it('does not turn database failures into an empty or fabricated catalog', async () => {
    state.read.mockRejectedValue(Error('fixture database failure'));
    await expect(countApprovedCatalog('all')).rejects.toThrow('fixture database failure');
    await expect(getApprovedPreview('12')).rejects.toThrow('fixture database failure');
  });
});
