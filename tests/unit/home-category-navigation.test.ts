import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, Children, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CATEGORY_LABELS } from '@/lib/ad-categories/contracts';
const state = vi.hoisted(() => ({ config: vi.fn(), search: vi.fn(), setting: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSetting: state.setting }));
vi.mock('@/lib/ad-categories/service', () => ({ getCategoryFormConfig: state.config }));
vi.mock('@/lib/data', () => ({ searchAds: state.search }));
vi.mock('@/components/ad-card', () => ({ AdGrid: ({ ads }: { ads: { id: number; title: string }[] }) => createElement('ul', {}, ads.map(ad => createElement('li', { key: ad.id }, ad.title))) }));
import { HomeCategoryNavigation } from '@/components/home-category-navigation';

const config = { enabled: true, labels: CATEGORY_LABELS, categories: [
  { id: 12, name: 'السيارات', active: true, order: 1 },
  { id: 13, name: 'قسم مخفي', active: false, order: 2 },
], subcategories: [] };
describe('homepage category discovery', () => {
  beforeEach(() => { vi.resetAllMocks(); state.config.mockResolvedValue(config); state.search.mockResolvedValue([]); state.setting.mockImplementation(async (_key, fallback) => fallback); });
  it('does not expose categories or query advertisements when the category switch is off', async () => {
    state.config.mockResolvedValue({ ...config, enabled: false });
    expect(await HomeCategoryNavigation({ selectedCategory: '12' })).toBeNull();
    expect(state.search).not.toHaveBeenCalled();
  });
  it('renders an accessible compact dropdown with only active categories', async () => {
    const html = renderToStaticMarkup(await HomeCategoryNavigation({}));
    expect(html).toContain('السيارات'); expect(html).not.toContain('قسم مخفي');
    expect(html).toMatch(/<select[^>]*name="category"/);
    expect(html).toContain('action="/"'); expect(html).toContain('method="get"');
    expect(state.search).not.toHaveBeenCalled();
  });
  it('renders only controls, leaving selected-category results to the continuous feed', async () => {
    state.search.mockResolvedValue([{ id: 1, title: 'Fixture matching car' }]);
    const html = renderToStaticMarkup(await HomeCategoryNavigation({ selectedCategory: '12' }));
    expect(state.search).not.toHaveBeenCalled();
    expect(html).not.toContain('Fixture matching car');
    expect(html).not.toContain('<h2');
    expect(html).toMatch(/<option[^>]*value="12"[^>]*selected/);
  });
  it.each(['13', '-1', '12 OR 1=1', '999', ['12', '13']].map(selectedCategory => ({ selectedCategory })))('ignores inactive/unknown/invalid selections: %j', async ({ selectedCategory }) => {
    await HomeCategoryNavigation({ selectedCategory });
    expect(state.search).not.toHaveBeenCalled();
  });
  it('hides empty or unavailable category configuration without breaking home', async () => {
    state.config.mockResolvedValueOnce({ ...config, categories: [] }).mockRejectedValueOnce(new Error('unavailable'));
    expect(await HomeCategoryNavigation({})).toBeNull();
    expect(await HomeCategoryNavigation({})).toBeNull();
    expect(state.search).not.toHaveBeenCalled();
  });
  it('shows an empty result for an active category with no matching ads', async () => {
    const html = renderToStaticMarkup(await HomeCategoryNavigation({ selectedCategory: '12' }));
    expect(html).not.toContain('لا توجد إعلانات');
  });
  it('reads all new UI copy from editable settings', async () => {
    state.config.mockResolvedValue({ ...config, labels: { ...CATEGORY_LABELS,
      browse: 'Custom browse', clear: 'Custom clear', resultsTitle: 'Custom {category} / {limit}', emptyText: 'Custom empty',
    } });
    const html = renderToStaticMarkup(await HomeCategoryNavigation({ selectedCategory: '12' }));
    for (const value of ['Custom browse', 'Custom clear']) expect(html).toContain(value);
    for (const key of ['browse', 'clear', 'resultsTitle', 'emptyText']) expect(CATEGORY_LABELS).toHaveProperty(key);
    expect(state.setting).not.toHaveBeenCalled();
  });
  it('lets controls wrap and gives the category selector a full mobile row', async () => {
    const html = renderToStaticMarkup(await HomeCategoryNavigation({ selectedCategory: '12' }));
    expect(html.match(/<form[^>]*>/)?.[0]).toContain('flex-wrap');
    expect(html.match(/<label[^>]*>/)?.[0]).toContain('basis-full');
  });
  it('remounts the uncontrolled form when the canonical category changes or clears', async () => {
    const selected = await HomeCategoryNavigation({ selectedCategory: '12' });
    const cleared = await HomeCategoryNavigation({});
    const invalid = await HomeCategoryNavigation({ selectedCategory: '999' });
    const formKey = (value: typeof selected) => Children.toArray(value!.props.children).find(child => isValidElement(child) && child.type === 'form');
    const selectedForm = formKey(selected), clearedForm = formKey(cleared), invalidForm = formKey(invalid);
    expect(isValidElement(selectedForm) && selectedForm.key).toContain('12');
    expect(isValidElement(clearedForm) && clearedForm.key).not.toContain('12');
    expect(isValidElement(invalidForm) && invalidForm.key).toBe(isValidElement(clearedForm) && clearedForm.key);
  });
  it('keeps visual category links on the public home and excludes inactive categories', async () => {
    const html = renderToStaticMarkup(await HomeCategoryNavigation({ selectedCategory: '12', visual: true }));
    expect(html).toContain('href="/?category=12"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('قسم مخفي');
    expect(html).not.toContain('/shop');
  });
});

it('keeps every active category reachable in one visual navigation without a duplicate selector', async () => {
 const many = { ...config, categories: Array.from({length:36},(_,i)=>({id:i+1,name:'Category '+i,active:true,order:i})) };
 const html = renderToStaticMarkup(await HomeCategoryNavigation({config:many,selectedCategory:'36',visual:true}));
 expect((html.match(/href="\/\?category=/g)||[])).toHaveLength(36);
 expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/\?category=36"/);
 expect(html).toContain('href="/"');
 expect(html).not.toContain('<select');
 expect(html).not.toContain('<form');
});

it('offers a native accessible all-categories menu only when the new theme requests it',async()=>{const expanded=renderToStaticMarkup(await HomeCategoryNavigation({config,visual:true,expandedMenu:true}));expect(expanded).toContain('<details');expect(expanded).toContain('جميع الأقسام');expect(expanded).toContain('aria-label="جميع أقسام السوق"');expect(expanded).not.toContain('قسم مخفي');const classic=renderToStaticMarkup(await HomeCategoryNavigation({config,visual:true}));expect(classic).not.toContain('<details');});
