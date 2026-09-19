import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AdCategoryFields } from '@/components/ad-category-fields';
import type { CategoryField } from '@/lib/ad-categories/validation';

const fields: CategoryField[] = [
  { key: 'contract', label: 'نوع العقد', type: 'select', group: 'تفاصيل الوظيفة', required: true, visible: true, order: 1, options: ['دائم', 'مؤقت'] },
  { key: 'skills', label: 'المهارات', type: 'multiselect', group: 'متطلبات الوظيفة', required: false, visible: true, order: 2, options: ['قيادة', 'حاسب آلي'] },
  { key: 'hidden', label: 'مخفي', type: 'text', group: '', required: true, visible: false, order: 3, options: [] },
];
describe('single-page grouped category fields', () => {
  it('renders grouped compact field controls without goods-specific defaults', () => {
    const html = renderToStaticMarkup(createElement(AdCategoryFields, { fields, values: {}, onChange: () => {} }));
    expect(html).toContain('تفاصيل الوظيفة');
    expect(html).toContain('متطلبات الوظيفة');
    expect(html).toContain('multiple');
    expect(html).not.toContain('مستعمل');
    expect(html).not.toContain('مخفي');
    expect(html).toContain('name="category_values"');
  });
  it('does not submit stale or hidden values after switching subcategory', () => {
    const html = renderToStaticMarkup(createElement(AdCategoryFields, { fields, values: { hidden: 'SECRET', old: 'OLD', contract: 'دائم' }, onChange: () => {} }));
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('OLD');
    expect(html).toContain('دائم');
  });
});
