import { describe, expect, it } from 'vitest';
import { validateDefinition, validateCategoryValues, visibleCategoryValues, type CategoryField } from '@/lib/ad-categories/validation';

const field = (extra: Partial<CategoryField> = {}): CategoryField => ({ key: 'use', label: 'استخدام الأرض', type: 'select', group: 'التفاصيل', required: true, visible: true, order: 1, options: ['سكني', 'تجاري'], ...extra });
describe('real-ad subcategory field validation', () => {
  it('rejects unknown keys, unexpected options, and missing mandatory values', () => {
    expect(() => validateCategoryValues([field()], { unexpected: 'x' })).toThrow();
    expect(() => validateCategoryValues([field()], { use: 'x' })).toThrow();
    expect(() => validateCategoryValues([field()], {})).toThrow();
    expect(validateCategoryValues([field()], { use: 'تجاري' })).toEqual({ use: 'تجاري' });
  });
  it('hidden fields cannot be submitted and do not make a form impossible to save', () => {
    const hidden = field({ visible: false });
    expect(validateCategoryValues([hidden], {})).toEqual({});
    expect(() => validateCategoryValues([hidden], { use: 'سكني' })).toThrow();
  });
  it('validates number bounds without coercing NaN, infinity, boolean or arrays', () => {
    const numeric = field({ type: 'number', min: 1, max: 100, options: [] });
    expect(validateCategoryValues([numeric], { use: '15.5' })).toEqual({ use: 15.5 });
    for (const use of ['', 'NaN', '1e309', Infinity, -1, 101, true, []]) {
      expect(() => validateCategoryValues([numeric], { use })).toThrow();
    }
  });
  it('supports unique multiselect and explicit false boolean', () => {
    const multi = field({ type: 'multiselect' });
    expect(validateCategoryValues([multi], { use: ['سكني', 'تجاري', 'سكني'] })).toEqual({ use: ['سكني', 'تجاري'] });
    expect(() => validateCategoryValues([multi], { use: ['غير معروف'] })).toThrow();
    expect(validateCategoryValues([field({ type: 'boolean' })], { use: false })).toEqual({ use: false });
  });
  it('omits empty optional/hidden/removed values from the public output, but keeps zero/false', () => {
    expect(visibleCategoryValues([field({ required: false })], { use: '' })).toEqual([]);
    expect(visibleCategoryValues([field({ visible: false })], { use: 'تجاري' })).toEqual([]);
    expect(visibleCategoryValues([], { removed: 'old' })).toEqual([]);
    expect(visibleCategoryValues([field({ type: 'number' })], { use: 0 })[0].value).toBe(0);
    expect(visibleCategoryValues([field({ type: 'boolean' })], { use: false })[0].value).toBe(false);
  });
  it('rejects malformed administrator definitions and unsafe keys', () => {
    expect(() => validateDefinition([field(), field()])).toThrow();
    expect(() => validateDefinition([field({ key: '__proto__' })])).toThrow();
    expect(() => validateDefinition([field({ type: 'select', options: [] })])).toThrow();
    expect(() => validateDefinition([field({ type: 'number', min: 50, max: 10 })])).toThrow();
    expect(validateDefinition([field()])).toHaveLength(1);
  });
  it('rejects non-string type values that stringify to a supported type', () => {
    expect(() => validateDefinition([{ ...field(), type: ['select'] }])).toThrow();
    expect(() => validateDefinition([{ ...field(), type: { toString: () => 'select' } }])).toThrow();
  });
  it('omits saved values incompatible with the current definition without changing storage', () => {
    const original = {use:'تجاري'};
    expect(visibleCategoryValues([field({options:['سكني']})], original)).toEqual([]);
    expect(original).toEqual({use:'تجاري'});
    expect(visibleCategoryValues([field({type:'number',min:10})], {use:5})).toEqual([]);
    expect(visibleCategoryValues([field({type:'boolean'})], {use:'true'})).toEqual([]);
    expect(visibleCategoryValues([field({type:'multiselect',options:['سكني']})], {use:['سكني','تجاري']})).toEqual([]);
    expect(visibleCategoryValues([field({type:'number'})], {use:'15'})[0].value).toBe(15);
  });
});
