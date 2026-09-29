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
