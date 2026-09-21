import {describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SupplierCatalog} from '@/components/supplier-catalog';
import type {CatalogActions, CatalogPage, CatalogProduct} from '@/lib/suppliers/catalog-selection';

const product = (status: CatalogProduct['status']): CatalogProduct => ({
  key: 'p_1', revision: 4, name: 'تمر فاخر', sku: 'DATES-1', supplierKey: 's_1', supplierName: 'شعبيات الأولين',
  image: null, priceMinor: 12500, costMinor: 9000, sellingMinor: status === 'imported' ? null : 12500, pricingPolicy: 'source',
  minimumPriceMinor: 0, minimumMarginMinor: 0, quantity: 8, available: true, hasOptions: false,
  status, statusLabel: status === 'imported' ? 'جاهز للاختيار' : 'مضاف ومخفي', canSelect: status === 'imported', canManage: status !== 'imported', active: false, visible: false, lastSyncAt: null,
});
const actions = {
  search: vi.fn(), details: vi.fn(), review: vi.fn(), approve: vi.fn(),
} as unknown as CatalogActions;
const page = (item: CatalogProduct): CatalogPage => ({products: [item], suppliers: [{key: 's_1', name: 'شعبيات الأولين'}], page: 1, hasNext: false, query: '', supplierKey: ''});

describe('supplier catalog product management controls', () => {
  it('shows selling price, hide and remove controls for a product already added to Trbhh', () => {
    const html = renderToStaticMarkup(createElement(SupplierCatalog, {initialData: page(product('added_hidden')), actions}));
    expect(html).toContain('سعر البيع في تربح');
    expect(html).toContain('تعديل سعر البيع');
    expect(html).toContain('إخفاء من تربح');
    expect(html).toContain('حذف من تربح');
  });

  it('explains that the supplier price is the default selling price before approval', () => {
    const html = renderToStaticMarkup(createElement(SupplierCatalog, {initialData: page(product('imported')), actions}));
    expect(html).toContain('سعر البيع الافتراضي هو سعر المورد');
  });

  it('renders an explicit missing-image placeholder and never borrows another product image', () => {
    const html = renderToStaticMarkup(createElement(SupplierCatalog, {initialData: page(product('imported')), actions}));
    expect(html).toContain('لا توجد صورة متاحة');
    expect(html).not.toMatch(/<img\b/);
  });
});
