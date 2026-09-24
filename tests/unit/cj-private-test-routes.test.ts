import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ staff: true, catalog: vi.fn(async (props?: unknown) => `catalog:${String(props)}`), product: vi.fn(async (props: unknown) => `product:${String(props)}`) }));
vi.mock('@/lib/cj/storefront', () => ({ cjStorefrontView: async () => ({ isStaff: state.staff }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('not_found'); } }));
vi.mock('@/app/cj/page', () => ({ default: state.catalog }));
vi.mock('@/app/cj/[id]/page', () => ({ default: state.product }));

import PrivateCjCatalogPage, { metadata as catalogMetadata } from '@/app/cj-test/page';
import PrivateCjProductPage, { metadata as productMetadata } from '@/app/cj-test/[id]/page';

describe('private CJ test routes', () => {
  beforeEach(() => { vi.clearAllMocks(); state.staff = true; });

  it('keeps the test catalog out of search indexing', () => {
    expect(catalogMetadata.robots).toEqual({ index: false, follow: false });
  });

  it('keeps product previews out of search indexing', () => {
    expect(productMetadata.robots).toEqual({ index: false, follow: false });
  });

  it('uses the existing server-guarded CJ catalog', async () => {
    const props = { searchParams: Promise.resolve({ tab: 'all' }) };
    await expect(PrivateCjCatalogPage(props)).resolves.toBe(`catalog:${String(props)}`);
    expect(state.catalog).toHaveBeenCalledWith(props);
  });

  it('uses the existing server-guarded CJ product detail', async () => {
    const props = { params: Promise.resolve({ id: '12' }), searchParams: Promise.resolve({}) };
    await expect(PrivateCjProductPage(props)).resolves.toBe(`product:${String(props)}`);
    expect(state.product).toHaveBeenCalledWith(props);
  });

  it('returns 404 to non-staff visitors without rendering catalog or product data', async () => {
    state.staff = false;
    const props = { params: Promise.resolve({ id: '12' }), searchParams: Promise.resolve({}) };
    await expect(PrivateCjCatalogPage()).rejects.toThrow('not_found');
    await expect(PrivateCjProductPage(props)).rejects.toThrow('not_found');
    expect(state.catalog).not.toHaveBeenCalled();
    expect(state.product).not.toHaveBeenCalled();
  });
});
