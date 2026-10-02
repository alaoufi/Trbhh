import { describe, expect, it } from 'vitest';
import { CATEGORY_SEED_TEMPLATES } from '@/lib/ad-categories/seed-templates';
import { categoryFieldsFingerprint, resolveCategoryDefinition } from '@/lib/ad-categories/template-upgrade';

const legacyLandFields = [{
  key: 'area_m2', label: 'مساحة الأرض', type: 'number' as const, options: [], group: 'المساحة والاستخدام',
  unit: 'م²', required: true, visible: true, min: 0.01, order: 0,
}];

describe('safe category template upgrades', () => {
  it('uses a stable fingerprint even when MySQL returns JSON object keys in another order', () => {
    expect(categoryFieldsFingerprint([{ key: 'x', required: true }]))
      .toBe(categoryFieldsFingerprint([{ required: true, key: 'x' }]));
  });
  it('upgrades only an untouched built-in v1 definition when enabled', () => {
    const current = CATEGORY_SEED_TEMPLATES.find(template => template.key === 'land')!;
    const resolved = resolveCategoryDefinition({
      version: 1, kind: 'property', priceEnabled: true, goodsEnabled: false,
      fields: legacyLandFields, fieldsFingerprint: '5cf4148a9517012e201e997297ca5145bbb9b55005d04cb113e46ff4c40fce59',
    }, current.categoryName, current.name, true);
    expect(resolved.fields).toEqual(current.fields);
    expect(resolved.upgradedFromBuiltInV1).toBe(true);
  });
  it('upgrades the last deployed pre-policy template without touching custom definitions',()=>{
    const current=CATEGORY_SEED_TEMPLATES.find(template=>template.key==='lifting')!;
    const resolved=resolveCategoryDefinition({version:1,kind:'goods',priceEnabled:true,goodsEnabled:true,fields:[],fieldsFingerprint:'9d5f62072037611f0423d812094f7a6a38771741f229fac823ce057846a84bf6'},current.categoryName,current.name,true);
    expect(resolved).toMatchObject({fields:current.fields,listingPolicy:current.listingPolicy,upgradedFromBuiltInV1:true});
  });
  it('upgrades the untouched rug multi-select material to the current dropdown',()=>{
    const current=CATEGORY_SEED_TEMPLATES.find(template=>template.key==='rugs')!;
    const previousFields=current.fields.map(field=>field.key==='material'?{...field,type:'multiselect' as const}:field);
    const resolved=resolveCategoryDefinition({
      version:1,kind:'goods',priceEnabled:true,goodsEnabled:true,
      fields:previousFields,fieldsFingerprint:categoryFieldsFingerprint(previousFields),
    },current.categoryName,current.name,true);
    expect(resolved.fields.find(field=>field.key==='material')).toMatchObject({type:'select'});
    expect(resolved.upgradedFromBuiltInV1).toBe(true);
  });
  it.each([
    ['legacy_heavy_equipment','ee83430decfa35ae00ccadfe1c6ecfdf3feae74bd7cc5441ff2cd8cb6230551e'],
    ['legacy_horses','745c75b154900a65dd5608c8956aeb93393092e6936afe9bf0311715e214e0ad'],
    ['legacy_fitness','56a4ad788a4d445ceab2149eb700cb1ef924ae19ad99a397a26af98c9cd9ea76'],
    ['lifting','b6324b60eecc3d07970756d1cae6e1fb79e2db642231eeae4b51a161497cb8ad'],
  ])('upgrades the untouched pre-audit %s schema', (key,fieldsFingerprint)=>{
    const current=CATEGORY_SEED_TEMPLATES.find(template=>template.key===key)!;
    const resolved=resolveCategoryDefinition({
      version:1,kind:current.kind,priceEnabled:current.priceEnabled,goodsEnabled:current.goodsEnabled,
      fields:[],fieldsFingerprint,
    },current.categoryName,current.name,true);
    expect(resolved).toMatchObject({fields:current.fields,upgradedFromBuiltInV1:true});
  });

  it.each([
    ['disabled', false, 1, '5cf4148a9517012e201e997297ca5145bbb9b55005d04cb113e46ff4c40fce59'],
    ['administrator version', true, 2, '5cf4148a9517012e201e997297ca5145bbb9b55005d04cb113e46ff4c40fce59'],
    ['customized fields', true, 1, 'custom-fingerprint'],
  ])('preserves %s instead of overwriting it', (_case, enabled, version, fieldsFingerprint) => {
    const original = {version, kind: 'property' as const, priceEnabled: true, goodsEnabled: false, fields: legacyLandFields, fieldsFingerprint};
    expect(resolveCategoryDefinition(original, 'عقارات', 'أراضٍ', enabled)).toMatchObject({
      fields: legacyLandFields,
      upgradedFromBuiltInV1: false,
    });
  });
});
