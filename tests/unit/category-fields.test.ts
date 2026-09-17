import { describe, it, expect } from 'vitest';
import { validateCategoryValues, chooseCategory } from '@/domain/category-fields';
const fields = [{ id: 1, key: 'capacity', label: 'الحمولة', type: 'number', options: [], required: true }];
describe('category-specific values', () => {
  it('rejects missing, negative, nonnumeric and foreign fields', () => {
    const inputs:Record<string,string>[]=[{}, { '1': '-1' }, { '1': 'abc' }, { '1': '2', '99': 'foreign' }];
    for (const input of inputs) expect(() => validateCategoryValues(fields, input)).toThrow();
  });
  it('preserves legacy ads with missing newly required values', () => expect(validateCategoryValues(fields, {}, true)).toEqual([]));
  it('accepts valid numbers and rejects unlisted options', () => {
    expect(validateCategoryValues(fields, {'1':'25'})).toEqual([{field_id:1n,value_text:'25'}]);
    expect(() => validateCategoryValues([{...fields[0],type:'select',options:['جديد']}],{'1':'مستعمل'})).toThrow();
  });
  it('keeps ambiguous classification in review and uses fallback for unknown text', () => {
    const cats = [{id:1,name:'معدات',keywords:['رافعة']},{id:2,name:'خدمات',keywords:['رافعة']}];
    expect(chooseCategory('رافعة','',cats,13).confidence).toBeLessThan(0.8);
    expect(chooseCategory('غير معروف','',cats,13).categoryId).toBe(13);
  });
});
