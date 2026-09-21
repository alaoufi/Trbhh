import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const state = vi.hoisted(() => ({ gate: vi.fn(), schema: vi.fn(), catalog: vi.fn() }));
vi.mock('@/lib/roles', () => ({ requireAction: state.gate }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/suppliers/schema', () => ({ assertSupplierSchemaReady: state.schema }));
vi.mock('@/lib/suppliers/catalog-admin', () => ({ loadCatalog: state.catalog }));
vi.mock('@/components/supplier-catalog', () => ({ SupplierCatalog: () => createElement('div', null, 'الكتالوج المصور') }));
vi.mock('@/app/admin/suppliers/catalog/actions', () => ({ searchProducts: vi.fn(), productDetails: vi.fn(), reviewProducts: vi.fn(), approveProducts: vi.fn() }));
import Page from '@/app/admin/suppliers/catalog/page';

describe('visual supplier catalog page', () => {
  beforeEach(() => { vi.resetAllMocks(); state.catalog.mockResolvedValue({ products: [], suppliers: [], page: 1, hasNext: false, query: '', supplierKey: '' }); });
  it('denies page access before reading source products', async () => {
    state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(Page()).rejects.toThrow('forbidden');
    expect(state.schema).not.toHaveBeenCalled(); expect(state.catalog).not.toHaveBeenCalled();
  });
  it('provides a safe retry path on readiness failure, never an empty-success state', async () => {
    state.schema.mockRejectedValueOnce(new Error('private database details'));
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('role="alert"'); expect(html).toContain('/admin/suppliers/integrations');
    expect(html).not.toContain('private database details'); expect(state.catalog).not.toHaveBeenCalled();
  });
  it('opens the bounded first page and keeps management navigation available', async () => {
    const html = renderToStaticMarkup(await Page());
    expect(state.catalog).toHaveBeenCalledWith({}, { query: '', supplierKey: '', page: 1 });
    expect(html).toContain('الكتالوج المصور'); expect(html).toContain('إعدادات النشر');
  });
});
