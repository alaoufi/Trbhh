import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AdCategoryFields } from '@/components/ad-category-fields';
import type { CategoryField } from '@/lib/ad-categories/validation';

const fields: CategoryField[] = [
  { key: 'contract', label: 'نوع العقد', type: 'select', group: 'تفاصيل الوظيفة', required: true, visible: true, order: 1, options: ['دائم', 'مؤقت'] },
  { key: 'skills', label: 'المهارات', type: 'multiselect', group: 'متطلبات الوظيفة', required: false, visible: true, order: 2, options: ['قيادة', 'حاسب آلي'] },
  { key: 'salary_range', label: 'نطاق الراتب', type: 'range', group: 'تفاصيل الوظيفة', required: true, visible: true, order: 3, options: [] },
  { key: 'hidden', label: 'مخفي', type: 'text', group: '', required: true, visible: false, order: 4, options: [] },
];
describe('single-page grouped category fields', () => {
  it('renders grouped compact field controls without goods-specific defaults', () => {
    const html = renderToStaticMarkup(createElement(AdCategoryFields, { fields, values: {}, onChange: () => {} }));
    expect(html).toContain('تفاصيل الوظيفة');
    expect(html).toContain('متطلبات الوظيفة');
    expect(html).not.toContain('multiple');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('اختر من القائمة');
    expect(html).not.toContain('مستعمل');
    expect(html).not.toContain('مخفي');
    expect(html).toContain('name="category_values"');
    expect(html).toContain('نوع العقد');
    expect(html).toContain('مطلوب');
    expect(html).toContain('المهارات');
    expect(html).toContain('اختياري');
    expect(html).toContain('data-field-group="تفاصيل الوظيفة"');
    expect(html).toContain('data-field-key="contract"');
    expect(html).toContain('data-required="true"');
    expect(html).toContain('border-red-200');
    expect(html).toContain('bg-red-50/70');
    expect(html).toContain('data-field-key="skills"');
    expect(html).toContain('data-required="false"');
    expect(html).toContain('border-emerald-200');
    expect(html).toContain('bg-emerald-50/60');
    expect(html).toContain('space-y-2');
    expect(html).toContain('gap-2');
    expect((html.match(/required=""/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('does not submit stale or hidden values after switching subcategory', () => {
    const html = renderToStaticMarkup(createElement(AdCategoryFields, { fields, values: { hidden: 'SECRET', old: 'OLD', contract: 'دائم' }, onChange: () => {} }));
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('OLD');
    expect(html).toContain('دائم');
  });
});
