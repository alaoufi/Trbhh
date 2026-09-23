import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ keys: new Set<string>(), write: vi.fn(), log: vi.fn(), imports: vi.fn(), existing: [] as { id: bigint }[], product: { id: 4, cj_product_id: 'CJ4', name: 'Source', name_ar: 'Old', source_description: null, display_description_ar: null, trbhh_category: '', status: 'draft', hidden: 1, agent_user_id: null, sale_price_override_minor: 1200 as number | null, sale_price_minor: 1200, image: '' } }));
vi.mock('@/lib/access-control/guards', () => ({
  requireAccess: async (module: string, action = 'view') => { if (!state.keys.has(`${module}:${action}`)) throw Error('access=denied'); return { uid: 9 }; },
  hasAccess: async (_uid: number, module: string, action = 'view') => state.keys.has(`${module}:${action}`),
}));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ uid: 9 }) }));
vi.mock('@/lib/audit', () => ({ logAdmin: state.log }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw Error('redirect:' + path); }, notFound: () => { throw Error('not_found'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/components/access-boundary', () => ({ AccessBoundary: ({ children, module, action = 'view' }: { children: ReactNode; module: string; action?: string }) => state.keys.has(`${module}:${action}`) ? children : null }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findFirst: async () => ({ id: 3n, phoneNumber: '' }) }, cj_products: { findMany: async () => state.existing } } }));
vi.mock('@/lib/cj/mapping', () => ({ getCjProductById: async () => ({ ...state.product }), cjProductOrderCount: async () => 0,
  removeCjProductById: state.write, setCjProductNameAr: state.write, setCjProductHidden: state.write, setCjProductStatus: state.write, setCjProductPriceOverride: async (id: number, minor: number | null) => { state.write(id, minor); state.product.sale_price_override_minor = minor; }, updateCjReview: state.write,
  setCjProductDescriptionAr: state.write, setCjProductCategory: state.write, listUntranslatedCjProducts: async () => [state.product],
}));
vi.mock('@/lib/cj/pricing', () => ({ setDefaultMarginBps: state.write, defaultMarginBps: async () => 3000 }));
vi.mock('@/lib/cj/sync', () => ({ saveCjSyncSettings: state.write, cjSyncSettings: async () => ({ enabled: false }), syncCjCatalog: async () => { state.write(); return { ok: true, imported: 1, pages: 1, skipped: 0 }; } }));
vi.mock('@/lib/cj/import', () => ({ importCjProductByPid: async (...args: unknown[]) => { state.imports(...args); state.write(); return { ok: true, pid: 'CJ4', salePriceMinor: 1200, supplierCostMinor: 900 }; } }));
vi.mock('@/lib/cj/translate', () => ({ translateToArabic: async () => 'ترجمة', translateManyCached: async () => { state.write(); return new Map([['source', 'ترجمة']]); }, learnTranslation: state.write }));
vi.mock('@/lib/cj/client', () => ({ getCategories: async () => ({ ok: true, data: [{ name: 'source' }] }) }));
vi.mock('@/lib/cj/orders/store', () => ({ createOrder: async () => { state.write(); return { id: 7n, created: true }; }, transitionOrder: async () => { state.write(); return { ok: true, from: 'awaiting_payment', to: 'paid' }; }, setOrderTracking: state.write, listOrderEvents: async () => [], getOrderById: async () => ({ id: 7n, status: 'awaiting_payment', carrier: 'old', tracking_number: '', tracking_url: '' }) }));
vi.mock('@/lib/cj/translate-warm', () => ({ warmCjTranslations: async () => { state.write(); return { categories: 1, productNames: 1 }; }, refreshCjMedia: async () => { state.write(); return { refreshed: 1 }; } }));
vi.mock('@/lib/cj/storefront', () => ({ setCjStorefrontPublic: state.write, cjStorefrontPublic: async () => false }));
vi.mock('@/lib/cj/agents', () => ({ upsertAgent: state.write, setDefaultAgentWeeklyQuota: state.write, setAgentActive: state.write, assignProductAgent: state.write, unassignProductAgent: state.write, getAgent: async () => ({ active: 0, weekly_quota: 2 }), defaultAgentWeeklyQuota: async () => 10, isActiveAgent: async () => true }));
vi.mock('@/lib/cj/sample', () => ({ sampleOneCjProduct: async () => null }));
import * as actions from '@/app/admin/suppliers/cj/actions';
import ReviewPage from '@/app/admin/suppliers/cj/review/[id]/page';
import OrderPage from '@/app/admin/suppliers/cj/orders/[id]/page';
import { pagePermission } from '@/lib/access-control/catalog';
import { redactAdminLog } from '@/lib/admin-audit-visibility';

const matrix = [
  ['importCjProduct', 'products', 'create'], ['removeCjProduct', 'products', 'delete'], ['saveCjArabic', 'products', 'edit'], ['saveCjPrice', 'products', 'edit'],
  ['toggleCjHidden', 'products', 'suspend'], ['translateCjProduct', 'products', 'edit'], ['saveCjReview', 'products', 'edit'], ['translateCjCategories', 'products', 'edit'],
  ['runCjTranslateWarm', 'products', 'edit'], ['refreshCjMediaAction', 'products', 'edit'], ['translateAllCj', 'products', 'edit'], ['setCjStorefront', 'products', 'approve'],
  ['approveCjProduct', 'products', 'approve'],
  ['createTestCjOrder', 'orders', 'create'], ['advanceCjOrder', 'orders', 'edit'], ['setCjOrderTracking', 'shipping', 'edit'],
  ['saveAgentQuota', 'integrations', 'manage_settings'], ['saveAgent', 'integrations', 'manage_settings'], ['toggleAgent', 'integrations', 'manage_settings'], ['assignAgentToProduct', 'integrations', 'manage_settings'],
  ['saveCjSync', 'integrations', 'manage_settings'], ['runCjSync', 'integrations', 'sync'], ['saveCjMargin', 'pricing', 'manage_settings'],
] as const;
function form() { const f = new FormData(); for (const [k, v] of Object.entries({ id: '4', pid: 'CJ4', nameAr: 'New', priceSar: '17', to: 'paid', ident: 'synthetic', userId: '3', productId: '4', agentUserId: '3', weeklyQuota: '5', marginPercent: '30', value: '1' })) f.set(k, v); return f; }
beforeEach(() => { vi.clearAllMocks(); state.keys.clear(); state.existing = []; state.product.sale_price_override_minor = 1200; });

describe('CJ admin granular mutation authorization', () => {
  it.each(matrix)('%s accepts its exact module grant and rejects unrelated staff', async (name, module, action) => {
    const invoke = () => actions[name](form());
    state.keys = new Set(['audit:view', 'products:view', 'orders:view', 'shipping:view', ...(module !== 'integrations' ? ['integrations:view', 'integrations:manage_settings'] : ['products:edit'])]);
    await expect(invoke()).rejects.toThrow('access=denied'); expect(state.write).not.toHaveBeenCalled(); expect(state.log).not.toHaveBeenCalled();
    state.keys = new Set([`${module}:view`, `${module}:${action}`]);
    await expect(invoke()).rejects.toThrow('redirect:/admin/suppliers/cj'); expect(state.write).toHaveBeenCalled();
  });
  it.each(['status', 'hidden'])('rejects unauthorized review %s before changing any field', async field => {
    state.keys = new Set(['products:view', 'products:edit']); const f = form(); f.set(field, field === 'status' ? 'ready' : '0');
    await expect(actions.saveCjReview(f)).rejects.toThrow('access=denied'); expect(state.write).not.toHaveBeenCalled();
    state.keys.add(`products:${field === 'status' ? 'approve' : 'suspend'}`);
    await expect(actions.saveCjReview(f)).rejects.toThrow('redirect:/admin/suppliers/cj/review/4');
  });
  it('an editor preserves hidden state and does not submit an approval change', async () => {
    state.keys = new Set(['products:view', 'products:edit']); await expect(actions.saveCjReview(form())).rejects.toThrow('redirect:');
    const review = state.write.mock.calls.find(call => typeof call[1] === 'object'); expect(review?.[1]).not.toHaveProperty('status');
    expect(state.write.mock.calls.some(call => typeof call[1] === 'boolean')).toBe(false);
  });
  it('requires suspend independently to unpublish the whole storefront', async () => {
    const f = form(); f.set('value', '0'); state.keys = new Set(['products:view', 'products:approve']);
    await expect(actions.setCjStorefront(f)).rejects.toThrow('access=denied'); expect(state.write).not.toHaveBeenCalled();
    state.keys.add('products:suspend'); await expect(actions.setCjStorefront(f)).rejects.toThrow('redirect:');
  });
  it('an order editor cannot mark a refund without the refund grant', async () => {
    state.keys = new Set(['orders:view', 'orders:edit']); const f = form(); f.set('to', 'refunded');
    await expect(actions.advanceCjOrder(f)).rejects.toThrow('access=denied'); expect(state.write).not.toHaveBeenCalled();
    state.keys.add('orders:refund'); await expect(actions.advanceCjOrder(f)).rejects.toThrow('redirect:');
  });
  it.each(['https://evil.test/path', '//evil.test', '/admin/suppliers/cj/../../users', '/admin/suppliers/cj-malicious', '/admin/suppliers/cj/browse%2f..%2f..%2fusers'])('normalizes an untrusted return path %s to the CJ browse page', async back => {
    state.keys = new Set(['products:view', 'products:create']); const f = form(); f.set('back', back);
    await expect(actions.importCjProduct(f)).rejects.toThrow('redirect:/admin/suppliers/cj/browse?imported=CJ4');
  });
  it('keeps a local CJ browse query and excludes external redirects', async () => {
    state.keys = new Set(['products:view', 'products:create']); const f = form(); f.set('back', '/admin/suppliers/cj/browse?page=2');
    await expect(actions.importCjProduct(f)).rejects.toThrow('redirect:/admin/suppliers/cj/browse?page=2&imported=CJ4');
  });
  it('creation alone cannot overwrite an existing imported product, including at the write', async () => {
    state.keys = new Set(['products:view', 'products:create']); state.existing = [{ id: 4n }];
    await expect(actions.importCjProduct(form())).rejects.toThrow('access=denied'); expect(state.imports).not.toHaveBeenCalled();
    state.existing = []; await expect(actions.importCjProduct(form())).rejects.toThrow('redirect:');
    expect(state.imports).toHaveBeenLastCalledWith('CJ4', { createOnly: true });
    state.keys.add('products:edit'); await expect(actions.importCjProduct(form())).rejects.toThrow('redirect:');
    expect(state.imports).toHaveBeenLastCalledWith('CJ4', { createOnly: false });
  });
  it('records the acting member and actual previous/new price after a permitted edit', async () => {
    state.keys = new Set(['products:view', 'products:edit']); await expect(actions.saveCjPrice(form())).rejects.toThrow('redirect:');
    expect(state.log).toHaveBeenCalledWith(9, 'تعديل منتجات CJ', '4', JSON.stringify({ field: 'price', before: 1200, after: 1700 }));
  });
  it('renders review editing, approval, and visibility independently', async () => {
    const html = async () => renderToStaticMarkup(await ReviewPage({ params: Promise.resolve({ id: '4' }), searchParams: Promise.resolve({}) }));
    state.keys = new Set(['products:view']); expect(await html()).not.toContain('حفظ المراجعة');
    state.keys.add('products:edit'); const editor = await html(); expect(editor).toContain('حفظ المراجعة'); expect(editor).not.toContain('name="status"'); expect(editor).not.toContain('name="hidden"');
    state.keys.add('products:approve'); expect(await html()).toContain('name="status"');
    state.keys.add('products:suspend'); expect(await html()).toContain('name="manageVisibility"');
    state.keys.delete('products:edit'); expect(await html()).toContain('اعتماد حالة العرض'); expect(await html()).not.toContain('حفظ المراجعة');
  });
  it('maps nested pages to their module and rejects unknown CJ prefixes', () => {
    expect(pagePermission('/admin/suppliers/cj/browse')).toBe('products:view'); expect(pagePermission('/admin/suppliers/cj/review/4')).toBe('products:view');
    expect(pagePermission('/admin/suppliers/cj/showcase')).toBe('products:view'); expect(pagePermission('/admin/suppliers/cj/orders/7')).toBe('orders:view');
    expect(pagePermission('/admin/suppliers/cj/agents')).toBe('integrations:view'); expect(pagePermission('/admin/suppliers/cj-malicious')).toBeNull();
  });
  it('renders order status and shipping controls only under their own view and action grants', async () => {
    const html = async () => renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: '7' }), searchParams: Promise.resolve({}) }));
    state.keys = new Set(['integrations:view', 'integrations:manage_settings']); await expect(html()).rejects.toThrow('access=denied');
    state.keys = new Set(['orders:view']); expect(await html()).not.toContain('تغيير الحالة'); expect(await html()).not.toContain('حفظ التتبّع');
    state.keys.add('orders:edit'); expect(await html()).toContain('تغيير الحالة'); expect(await html()).not.toContain('حفظ التتبّع');
    state.keys.add('shipping:edit'); expect(await html()).not.toContain('حفظ التتبّع');
    state.keys.add('shipping:view'); expect(await html()).toContain('حفظ التتبّع');
  });
  it('CJ mutation audit details require the recorded source module view', () => {
    const row = { id: 1, adminId: 9, adminName: 'Operator', action: 'تعديل منتجات CJ', target: '4', note: 'before-and-after', at: null };
    expect(redactAdminLog([row], new Set(['audit:view']))[0].note).toBeNull();
    expect(redactAdminLog([row], new Set(['audit:view', 'products:view']))[0].note).toBe('before-and-after');
  });
});
