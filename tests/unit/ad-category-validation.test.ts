import { describe, expect, it } from 'vitest';
import { cardCategoryValues, comparableCategoryValues, fieldApplies, fieldIsRequired, validateDefinition, validateCategoryValues, visibleCategoryValues, type CategoryField } from '@/lib/ad-categories/validation';

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
  it('normalizes display, search and help metadata while preserving old definitions', () => {
    const [normalized] = validateDefinition([{...field(), placeholder:'اختر الاستخدام', helpText:'اختر الأقرب', searchable:true, filterable:true, comparable:true, showInCard:true, showInDetails:false}]);
    expect(normalized).toMatchObject({placeholder:'اختر الاستخدام',helpText:'اختر الأقرب',searchable:true,filterable:true,comparable:true,showInCard:true,showInDetails:false});
    expect(validateDefinition([field()])[0]).toMatchObject({searchable:false,filterable:false,comparable:false,showInCard:false,showInDetails:true});
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
  it('projects only fields explicitly selected for cards and comparison',()=>{
    const fields=validateDefinition([
      field({key:'make',label:'الماركة',showInCard:true,comparable:true}),
      field({key:'secret',label:'داخلي',showInCard:false,comparable:false}),
    ]);
    const values={make:'سكني',secret:'تجاري'};
    expect(cardCategoryValues(fields,values).map(item=>item.key)).toEqual(['make']);
    expect(comparableCategoryValues(fields,values).map(item=>item.key)).toEqual(['make']);
  });
  it('grandfathers only explicitly missing required fields for legacy edits',()=>{
    expect(validateCategoryValues([field()],{},{grandfatherMissingRequired:new Set(['use'])})).toEqual({});
    expect(()=>validateCategoryValues([field()],{},{})).toThrow('الحقل مطلوب');
  });
  it('supports explicit show, hide and required conditional effects',()=>{
    const show=field({required:false,dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'show'});
    const hide=field({required:false,dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'hide'});
    const requiredIf=field({required:false,dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'require'});
    expect(fieldApplies(show,{listingType:'sale'})).toBe(false);
    expect(fieldApplies(show,{listingType:'rent'})).toBe(true);
    expect(fieldApplies(hide,{listingType:'sale'})).toBe(true);
    expect(fieldApplies(hide,{listingType:'rent'})).toBe(false);
    expect(fieldApplies(requiredIf,{listingType:'sale'})).toBe(true);
    expect(fieldApplies(requiredIf,{listingType:'rent'})).toBe(true);
    expect(fieldIsRequired(requiredIf,{listingType:'sale'})).toBe(false);
    expect(fieldIsRequired(requiredIf,{listingType:'rent'})).toBe(true);
    expect(validateCategoryValues([requiredIf],{},{listingType:'sale'})).toEqual({});
    expect(()=>validateCategoryValues([requiredIf],{},{listingType:'rent'})).toThrow('الحقل مطلوب');
  });
  it('rejects invalid conditional effects in administrator definitions',()=>{
    expect(()=>validateDefinition([field({dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'unknown' as never})])).toThrow();
    expect(validateDefinition([field({dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'require'})])[0])
      .toMatchObject({conditionEffect:'require'});
  });
});
