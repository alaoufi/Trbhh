import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  setting: vi.fn(),
  categories: vi.fn(),
  subcategories: vi.fn(),
  raw: vi.fn(),
  previewState: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({ getSetting: state.setting }));
vi.mock('@/lib/redis', () => ({ previewHashGetAll: state.previewState }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    categories: { findMany: state.categories },
    sub_categories: { findMany: state.subcategories },
    $queryRaw: state.raw,
  },
}));

import { getCategoryFormConfig, getPublicCategories } from '@/lib/ad-categories/service';

describe('preview-only category visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TRBHH_READ_ONLY_PREVIEW = '1';
    state.setting.mockImplementation(async (key: string, fallback: string) => key === 'categories_v2_enabled' ? '1' : fallback);
    state.categories.mockResolvedValue([{ id: 10n, name: 'العقارات', is_active: 'yes', ordered: 1 }]);
    state.subcategories.mockResolvedValue([{ id: 101n, category_id: 10, name: 'أراضٍ', active: 1, order: 1 }]);
    state.raw.mockResolvedValue([{ subcategory_id: 101n, version: 2, kind: 'real_estate', price_enabled: 1, goods_enabled: 0, fields_json: [] }]);
    state.previewState.mockResolvedValue({ 'category:10': '0' });
  });

  it('removes a category hidden in preview from the public form while retaining it as hidden for admin', async () => {
    const publicConfig = await getCategoryFormConfig();
    const adminConfig = await getCategoryFormConfig(true);

    expect(publicConfig.categories).toEqual([]);
    expect(publicConfig.subcategories).toEqual([]);
    expect(adminConfig.categories).toEqual([expect.objectContaining({ id: 10, active: false })]);
    expect(adminConfig.subcategories).toEqual([expect.objectContaining({ id: 101, active: true })]);
    expect(state.previewState).toHaveBeenCalled();
  });

  it('removes the hidden category label and fields from public advertisement details', async () => {
    state.raw.mockResolvedValue([{
      ad_id: 500n,
      subcategory_id: 101n,
      category_id: 10n,
      category_name: 'العقارات',
      subcategory_name: 'أراضٍ',
      version: 2,
      kind: 'real_estate',
      price_enabled: 1,
      goods_enabled: 0,
      active: 1,
      is_active: 'yes',
      fields_json: [{ key: 'area', label: 'المساحة', type: 'number', group: '', required: false, visible: true, order: 1, options: [] }],
      values_json: { area: 800 },
    }]);

    const categories = await getPublicCategories([500n]);

    expect(categories.get(500)).toEqual(expect.objectContaining({ subcategoryName: undefined, categoryFields: [] }));
  });

  it('preserves raw legacy values but suppresses untrusted specifications from public projections',async()=>{
    state.previewState.mockResolvedValue({});
    state.raw.mockResolvedValue([{
      ad_id:3412n,title:'مقاول شبوك ونخيل وتركيب أسوار',subcategory_id:null,selected_subcategory_id:255n,category_id:17n,
      category_name:'مقاولات مواد بناء',subcategory_name:'ادوات بناء',version:null,kind:null,price_enabled:null,goods_enabled:null,
      active:1,is_active:'yes',fields_json:null,values_json:{building_tool_kind:'أخرى',brand:'مقاول شبوك ونخيل',condition:'جديد'},
      sale_type:'sale',adsType:'offer',price_type:'sale',
    }]);
    const category=(await getPublicCategories([3412n])).get(3412);
    expect(category).toMatchObject({categoryFieldsTrusted:false,categoryFieldsSuppressedReason:'service_in_goods_leaf',subcategoryName:undefined,categoryFields:[],categoryCardFields:[],comparableCategoryFields:[]});
  });
});
