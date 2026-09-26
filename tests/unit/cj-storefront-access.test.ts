import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ keys: new Set<string>(), session: vi.fn(), active: false, assigned: null as bigint | null, write: vi.fn(), public: false, gallery: ['https://example.test/photo.jpg'], sourceFetch: vi.fn(), details: null as any, verifiedVariants: [] as any[] }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth', () => ({ getSession: state.session }));
vi.mock('@/lib/roles', () => ({ hasAnyAdmin: async () => state.keys.size > 0 }));
vi.mock('@/lib/access-control/guards', () => ({ requireAccess: vi.fn(), hasAccess: async (_uid: number, module: string, action = 'view') => state.keys.has(`${module}:${action}`) }));
vi.mock('@/lib/settings', () => ({ getSetting: async () => state.public ? '1' : '0', setSetting: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw Error('redirect:' + path); }, notFound: () => { throw Error('not_found'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cj/agents', () => ({ isActiveAgent: async () => state.active, getAgent: async () => null, agentContactLinks: vi.fn(), upsertAgent: vi.fn(), setDefaultAgentWeeklyQuota: vi.fn(), setAgentActive: vi.fn(), assignProductAgent: vi.fn(), unassignProductAgent: vi.fn() }));
vi.mock('@/lib/cj/mapping', () => {
  const product = async () => ({ id: 4n, cj_product_id: 'CJ4', agent_user_id: state.assigned, name: 'Fixture', name_ar: 'سلعة', image: state.gallery[0] || '', sale_price_minor: 1000, currency: 'SAR', hidden: 0 });
  return { getCjProductById: product, getStorefrontCjProduct: product, listStorefrontCjProducts: async () => [], getVerifiedCjVariants: () => state.verifiedVariants, parseCjImages: () => state.gallery, parseCjDetails: () => state.details, parseCjAvailability: () => null, cjShipEstimateFromAvailability: () => null, cjArabicName: async (r: { name_ar?: string; name?: string }) => r.name_ar || r.name || '', cjArabicDescription: async () => '', cjProductOrderCount: async () => 0,
    removeCjProductById: state.write, setCjProductNameAr: state.write, setCjProductHidden: state.write, setCjProductPriceOverride: state.write, setCjProductDescriptionAr: state.write, setCjProductCategory: state.write, setCjProductGallery: state.write,
    listUntranslatedCjProducts: vi.fn(), updateCjReview: vi.fn() };
});
vi.mock('@/lib/cj/pricing', () => ({ setDefaultMarginBps: vi.fn() }));
vi.mock('@/lib/cj/sync', () => ({ saveCjSyncSettings: vi.fn(), syncCjCatalog: vi.fn(), cjSyncSettings: async () => null }));
vi.mock('@/lib/cj/import', () => ({ importCjProductByPid: vi.fn() }));
vi.mock('@/lib/cj/translate', () => ({ translateToArabic: vi.fn(), translateManyCached: vi.fn(), learnTranslation: vi.fn() }));
vi.mock('@/lib/cj/client', () => ({ getCategories: vi.fn(), getProduct: state.sourceFetch }));
vi.mock('@/lib/cj/orders/store', () => ({ createOrder: vi.fn(), transitionOrder: vi.fn(), setOrderTracking: vi.fn() }));
vi.mock('@/lib/cj/translate-warm', () => ({ warmCjTranslations: vi.fn(), refreshCjMedia: vi.fn() }));
vi.mock('@/components/ad-card', () => ({ AdGrid: () => null }));
vi.mock('@/components/share-buttons', () => ({ ShareButtons: () => null }));
import { saveCjStorefrontEdit, hideCjStorefront, deleteCjStorefront } from '@/app/admin/suppliers/cj/actions';
import { cjStorefrontView } from '@/lib/cj/storefront';
import ProductPage from '@/app/cj/[id]/page';
import CatalogPage from '@/app/cj/page';

const actions = [['edit', saveCjStorefrontEdit], ['suspend', hideCjStorefront], ['delete', deleteCjStorefront]] as const;
function form() { const f = new FormData(); f.set('id', '4'); f.set('nameAr', 'اسم'); f.set('hidden', '1'); return f; }
async function html() { return renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: '4' }), searchParams: Promise.resolve({}) })); }
beforeEach(() => { vi.clearAllMocks(); state.keys = new Set(['audit:view']); state.session.mockResolvedValue({ uid: 9 }); state.active = false; state.assigned = null; state.public = false; state.gallery = ['https://example.test/photo.jpg']; state.details = null; state.verifiedVariants = [{ vid: 'test-vid', name: 'Black XL', optionKey: 'Color-Black-Size-XL', sku: 'SKU-1', priceUsd: 2, weight: 100, attributes: {} }]; });

describe('CJ storefront precise capabilities', () => {
  it('an unrelated staff grant does not expose private storefront preview', async () => {
    expect(await cjStorefrontView()).toEqual({ visible: false, isPublic: false, isStaff: false });
    state.keys = new Set(['products:view']); expect((await cjStorefrontView()).isStaff).toBe(true);
  });
  it.each(actions)('rejects a direct %s action from an audit-only staff session', async (_verb, action) => {
    await expect(action(form())).rejects.toThrow('redirect:/account?access=denied'); expect(state.write).not.toHaveBeenCalled();
  });
  it.each(actions)('requires view and the specific %s grant; other mutations remain denied', async (verb, action) => {
    state.keys = new Set([`products:${verb}`]); await expect(action(form())).rejects.toThrow('access=denied');
    state.keys.add('products:view'); await expect(action(form())).rejects.toThrow('redirect:/cj'); expect(state.write).toHaveBeenCalled();
    state.write.mockClear();
    for (const [other, denied] of actions) if (other !== verb) await expect(denied(form())).rejects.toThrow('access=denied');
    expect(state.write).not.toHaveBeenCalled();
  });
  it('active agents manage only their assigned product', async () => {
    state.keys.clear(); state.active = true; state.assigned = 10n;
    await expect(saveCjStorefrontEdit(form())).rejects.toThrow('access=denied');
    state.assigned = 9n; await expect(saveCjStorefrontEdit(form())).rejects.toThrow('redirect:/cj/4?edited=1');
    state.active = false; state.write.mockClear(); await expect(deleteCjStorefront(form())).rejects.toThrow('access=denied'); expect(state.write).not.toHaveBeenCalled();
  });
  it('renders only the controls authorized for a product editor', async () => {
    state.public = true; await expect(html()).rejects.toThrow('not_found');
    state.keys = new Set(['products:view', 'products:edit']); const result = await html();
    expect(result).toContain('حفظ التعديل'); expect(result).not.toContain('>حذف</button>'); expect(result).not.toContain('>إخفاء</button>');
  });
  it('keeps management controls expanded and visible to an authorized manager', async () => {
    state.keys = new Set(['products:view', 'products:edit', 'products:suspend', 'products:delete']);
    const result = await html();
    expect(result).toContain('حفظ التعديل'); expect(result).toContain('>إخفاء</button>'); expect(result).toContain('>حذف</button>');
    expect(result).not.toContain('<details class="min-w-0 rounded-2xl border border-primary/20');
  });
  it('explains the permission gate to a read-only product viewer', async () => {
    state.keys = new Set(['products:view']);
    const result = await html();
    expect(result).toContain('أدوات تعديل هذه السلعة وإخفائها وحذفها تتطلب صلاحيات المنتجات المناسبة');
    expect(result).toContain('href="/admin/access-control"');
    expect(result).not.toContain('>حذف</button>');
  });
  it('does not render unverified CJ options as selectable product variants', async () => {
    state.keys = new Set(['products:view']);
    state.details = { variantCount: 21, variants: Array.from({ length: 21 }, (_, i) => ({ vid: `VID-${i}`, name: `Variant ${i}`, optionKey: `Color: ${i}`, sku: `SKU-${i}`, priceUsd: 7.86, weight: 550 })) };
    state.verifiedVariants = [];
    const result = await html();
    expect(result).not.toContain('خيارات المنتج قبل الإضافة');
    expect(result).not.toContain('التوفر غير متحقق');
    expect(result).toContain('لا يوجد خيار ثبت مخزونه وشحنه');
  });
  it('keeps the new trial private even if the legacy public switch is enabled', async () => {
    state.public = true; state.keys.clear();
    expect(renderToStaticMarkup(await CatalogPage())).toContain('هذا القسم غير متاح');
    await expect(html()).rejects.toThrow('not_found');
    state.session.mockResolvedValue(null);
    await expect(html()).rejects.toThrow('not_found');
  });
  it('shows a missing-image placeholder without a supplier fetch or a write during GET', async () => {
    state.gallery = []; state.keys = new Set(['products:view']);
    expect(await html()).toContain('الصورة غير متاحة');
    expect(state.sourceFetch).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
});
