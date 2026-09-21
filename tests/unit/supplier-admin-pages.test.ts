import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ gate: vi.fn(), schema: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/commerce/schema', () => ({ assertCommerceSchemaReady: state.schema }));
vi.mock('@/lib/roles', () => ({ requireAction: state.gate }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.query } }));
vi.mock('@/app/admin/suppliers/actions', () => ({ saveSupplier: vi.fn(), saveSupplierProduct: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not_found'); } }));
import Suppliers from '@/app/admin/suppliers/page';
import Accounts from '@/app/admin/commerce/accounts/page';
describe('supplier and operational accounting pages', () => {
  beforeEach(() => { vi.resetAllMocks(); state.gate.mockResolvedValue({ uid: 9 }); state.query.mockResolvedValue([]); });
  it.each([[Suppliers, 'suppliers'], [Accounts, 'commerce']] as const)('gates page access before any reads', async (page, service) => {
    state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow('forbidden');
    expect(state.gate).toHaveBeenCalledWith(service, 'view'); expect(state.query).not.toHaveBeenCalled();
  });
  it('defaults profile off, disables API activation, and offers only a credential reference', async () => {
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(/name="active"[^>]*value="1"/);
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*name="apiEnabled"|<input[^>]*name="apiEnabled"[^>]*disabled=""/);
    expect(html).toContain('TRBHH_SUPPLIER_');
    expect(html).not.toContain('type="password"');
    expect(html).toContain('بانتظار');
    expect(state.query.mock.calls.every(call => /LIMIT 100/.test(call[0].join('?')))).toBe(true);
    expect(html).toMatch(/<textarea[^>]*name="notes"/);
    expect(html).toMatch(/<textarea[^>]*name="address"/);
    expect(html).toMatch(/<textarea[^>]*name="settlementTerms"/);
    expect(html.match(/<input[^>]*name="phone"[^>]*>/)?.[0]).toContain('maxLength="40"');
  });
  it('edits existing mappings by product name and keeps inactive supplier choices unavailable', async () => {
    state.query.mockResolvedValueOnce([{ id: 7n, name: 'Active fixture', active: 1 }, { id: 8n, name: 'Inactive fixture', active: 0 }]).mockResolvedValueOnce([{ product_id: 987654321n, supplier_id: 7n, supplier_sku: 'SKU', unit_cost_minor: 1000, title: 'Fixture product', supplier_name: 'Active fixture', supplier_active: 1 }]);
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(/<select[^>]*name="supplierId"/);
    expect(html).toContain('Active fixture');
    expect(html).toMatch(/<option[^>]*value="8"[^>]*disabled=""|<option[^>]*disabled=""[^>]*value="8"/);
    expect(html).not.toMatch(/<input[^>]*name="supplierId"/);
    expect(html).toMatch(/<input type="hidden" name="productId" value="987654321"/);
    expect(html).not.toContain('رقم السلعة المعتمدة');
    expect(html).not.toContain('#987654321');
    expect(html).toContain('تعديل ربط Fixture product');
    expect(html).toContain('/admin/suppliers/catalog');
  });
  it('replaces manual product-number creation with the visual catalog', async () => {
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('عرض المنتجات واختيارها');
    expect(html).toContain('المنتجات تبقى مخفية');
    expect(html).not.toContain('name="productId"');
  });
  it.each(['', '0', '-1', '01', '1.5', '1e2', '100001', '1 OR 1=1', ['2', '3']].map(page => ({ page })))('rejects invalid supplier pages before schema or data queries: %j', async ({ page }) => {
    await expect(Suppliers({ searchParams: Promise.resolve({ page }) })).rejects.toThrow('not_found');
    expect(state.schema).not.toHaveBeenCalled(); expect(state.query).not.toHaveBeenCalled();
  });
  it('paginates both lists with bounded offsets and previous/next links', async () => {
    state.query.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ id: BigInt(index + 1), name: `Supplier ${index}`, active: 1 }))).mockResolvedValueOnce([]);
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(state.query).toHaveBeenCalledTimes(2);
    for (const call of state.query.mock.calls) {
      expect(call[0].join('?')).toMatch(/ORDER BY .* DESC LIMIT 100 OFFSET \?/);
      expect(call.slice(1)).toEqual([100]);
    }
    expect(html).toContain('/admin/suppliers?page=1'); expect(html).toContain('/admin/suppliers?page=3');
  });
  it('caps pagination at 100000 and omits next for exhausted lists', async () => {
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({ page: '100000' }) }));
    expect(state.query.mock.calls[0].slice(1)).toEqual([9999900]);
    expect(html).toContain('/admin/suppliers?page=99999'); expect(html).not.toContain('/admin/suppliers?page=100001');
  });
  it('omits previous and next on an empty first page', async () => {
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('/admin/suppliers?page=0'); expect(html).not.toContain('/admin/suppliers?page=2');
    expect(state.query.mock.calls[0].slice(1)).toEqual([0]);
  });
  it.each([0, 1])('retains the current off-page supplier with active=%s', async active => {
    state.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ product_id: 12n, supplier_id: 7n, supplier_sku: 'SKU', unit_cost_minor: 1000, title: 'Fixture product', supplier_name: 'Off-page supplier', supplier_active: active }]);
    const html = renderToStaticMarkup(await Suppliers({ searchParams: Promise.resolve({ page: '2' }) }));
    const option = html.match(/<option[^>]*value="7"[^>]*>[^<]*<\/option>/)?.[0];
    expect(option).toContain('Off-page supplier'); expect(option).toContain('selected=""');
    if (active) expect(option).not.toContain('disabled'); else expect(option).toContain('disabled');
    expect(state.query.mock.calls[1][0].join('?')).toContain('s.active AS supplier_active');
  });
  it.each(['0', '-1', '01', '1 OR 1=1', ['2', '3']].map(supplier => ({ supplier })))('rejects malformed accounting filters before querying: %j', async ({ supplier }) => {
    await expect(Accounts({ searchParams: Promise.resolve({ supplier }) })).rejects.toThrow('not_found');
    expect(state.query).not.toHaveBeenCalled();
  });
  it('filters both bounded accounting lists and links orders without payment actions', async () => {
    state.query.mockResolvedValueOnce([{ id: 1n, order_id: 12n, provider: 'fixture', provider_ref: 'bank-reference', amount_minor: 2500, currency: 'SAR', recorded_at: new Date('2026-09-19T00:00:00Z') }])
      .mockResolvedValueOnce([{ id: 2n, order_id: 12n, product_id: 3n, supplier_id: 7n, supplier_name: 'Supplier snapshot', amount_minor: 1500, currency: 'SAR', status: 'offline_pending', created_at: new Date('2026-09-19T00:00:00Z') }]);
    const html = renderToStaticMarkup(await Accounts({ searchParams: Promise.resolve({ supplier: '7' }) }));
    expect(html).toContain('bank-reference'); expect(html).toContain('Supplier snapshot');
    expect(html).toContain('/admin/commerce/orders/12'); expect(html).toContain('25.00'); expect(html).toContain('15.00');
    expect(html).toContain('خارج الموقع'); expect(html).toContain('سجل تشغيلي');
    expect(html).not.toMatch(/method="post"|formAction|تأكيد الدفع|دفع المورد/);
    expect(state.query).toHaveBeenCalledTimes(2);
    for (const call of state.query.mock.calls) { expect(call.slice(1)).toContain(7n); expect(call[0].join('?')).toMatch(/LIMIT 100/); }
    expect(state.query.mock.calls[0][0].join('?')).toContain('EXISTS');
  });
  it.each([Suppliers, Accounts])('shows a safe readiness message without reading partial tables', async page => {
    state.schema.mockRejectedValueOnce(new Error('private DB details'));
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('غير جاهز'); expect(html).not.toContain('private DB details');
    expect(state.query).not.toHaveBeenCalled();
  });
  it.each(['', '0', '-1', '01', '1.5', '1e2', '100001', '1 OR 1=1', ['2', '3']].map(page => ({ page })))('rejects invalid accounting pages before any queries: %j', async ({ page }) => {
    await expect(Accounts({ searchParams: Promise.resolve({ page, supplier: '7' }) })).rejects.toThrow('not_found');
    expect(state.schema).not.toHaveBeenCalled(); expect(state.query).not.toHaveBeenCalled();
  });
  const receipts = () => Array.from({ length: 100 }, (_, i) => ({ id: BigInt(i + 1), order_id: 12n, provider: 'fixture', provider_ref: `ref-${i}`, amount_minor: 2500, currency: 'SAR', recorded_at: new Date('2026-09-19T00:00:00Z') }));
  it('preserves supplier filtering in both page links and offsets both ledger queries', async () => {
    state.query.mockResolvedValueOnce(receipts()).mockResolvedValueOnce([]);
    const html = renderToStaticMarkup(await Accounts({ searchParams: Promise.resolve({ page: '2', supplier: '7' }) }));
    for (const call of state.query.mock.calls) {
      expect(call[0].join('?')).toMatch(/ORDER BY .* DESC LIMIT 100 OFFSET \?/);
      expect(call.slice(1)).toEqual([7n, 7n, 100]);
    }
    expect(html).toContain('/admin/commerce/accounts?page=1&amp;supplier=7');
    expect(html).toContain('/admin/commerce/accounts?page=3&amp;supplier=7');
    expect(html).not.toContain('method="post"');
  });
  it('uses first page without a filter and stops next navigation at the cap', async () => {
    let html = renderToStaticMarkup(await Accounts({ searchParams: Promise.resolve({}) }));
    expect(state.query.mock.calls[0].slice(1)).toEqual([null, null, 0]);
    expect(html).not.toContain('accounts?page=0'); expect(html).not.toContain('accounts?page=2');
    state.query.mockClear(); state.query.mockResolvedValueOnce(receipts()).mockResolvedValueOnce([]);
    html = renderToStaticMarkup(await Accounts({ searchParams: Promise.resolve({ page: '100000' }) }));
    expect(state.query.mock.calls[0].slice(1)).toEqual([null, null, 9999900]);
    expect(html).toContain('accounts?page=99999'); expect(html).not.toContain('accounts?page=100001');
    expect(html).not.toContain('&amp;supplier=');
  });
});
