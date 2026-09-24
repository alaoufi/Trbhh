import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ staff: true, feed: vi.fn(), preview: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ uid: 1 }) }));
vi.mock('@/lib/cj/storefront', () => ({ cjStorefrontView: async () => ({ isStaff: state.staff }), cjProductImages: () => [], cjImg: (url: string) => url }));
vi.mock('@/lib/cj/catalog-feed', () => ({ CJ_CATALOG_TABS: [{ id: 'all', label: 'الكل' }, { id: 'imported', label: 'السلع المستوردة' }, { id: 'members', label: 'اعلانات الاعضاء' }, { id: 'verified', label: 'اعلانات موثقة' }, { id: 'trbhh', label: 'اعلانات تربح' }], loadCjCatalog: state.feed }));
vi.mock('@/lib/cj/approved-catalog', () => ({ getApprovedPreview: state.preview }));
vi.mock('@/components/ad-card', () => ({ AdCardMarketplace: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('not_found'); } }));
import Catalog from '@/app/cj/page';
import ApprovedPage from '@/app/cj/approved/[id]/page';

beforeEach(() => { state.staff = true; vi.clearAllMocks(); state.feed.mockResolvedValue({ tab: 'verified', page: 2, pageCount: 3, total: 60, items: [] }); state.preview.mockResolvedValue({ id: '12', title: 'عنوان تجريبي', priceMinor: 12345, stock: 1, images: [], description: '<ب>وصف آمن</ب>' }); });

describe('private catalog navigation and approved preview', () => {
  it('never reads catalog or approved detail for a nonstaff visitor', async () => {
    state.staff = false;
    expect(renderToStaticMarkup(await Catalog())).toContain('هذا القسم غير متاح');
    await expect(ApprovedPage({ params: Promise.resolve({ id: '12' }) })).rejects.toThrow('not_found');
    expect(state.feed).not.toHaveBeenCalled(); expect(state.preview).not.toHaveBeenCalled();
  });
  it('renders all requested tabs and preserves the selected tab in pagination links', async () => {
    const html = renderToStaticMarkup(await Catalog({ searchParams: Promise.resolve({ tab: 'verified', page: '2' }) }));
    for (const tab of ['all', 'imported', 'members', 'verified', 'trbhh']) expect(html).toContain(`/cj?tab=${tab}`);
    expect(html).toContain('/cj?tab=verified&amp;page=1'); expect(html).toContain('/cj?tab=verified&amp;page=3');
    expect(html).toContain('التوثيق يخص حساب البائع');
    expect(state.feed).toHaveBeenCalledWith({ tab: 'verified', page: '2' });
  });
  it('approved details are informational, with no checkout form, payment route or purchase control', async () => {
    const html = renderToStaticMarkup(await ApprovedPage({ params: Promise.resolve({ id: '12' }) }));
    expect(html).toContain('123.45 ر.س'); expect(html).toContain('عنوان تجريبي'); expect(html).toContain('وصف آمن');
    expect(html).not.toContain('&lt;ب&gt;');
    for (const form of html.match(/<form\b[^>]*>/g) ?? []) { expect(form).toContain('method="dialog"'); expect(form).not.toContain('action='); }
    expect(html).not.toContain('/shop/'); expect(html).not.toContain('/checkout'); expect(html).not.toContain('أضف إلى السلة');
  });
  it('returns not found when current eligibility no longer permits the saved product', async () => {
    state.preview.mockResolvedValue(null);
    await expect(ApprovedPage({ params: Promise.resolve({ id: '12' }) })).rejects.toThrow('not_found');
  });
});
