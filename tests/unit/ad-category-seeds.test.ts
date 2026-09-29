import { describe, expect, it } from 'vitest';
import { CATEGORY_SEED_TEMPLATES } from '@/lib/ad-categories/seed-templates';
import { validateDefinition } from '@/lib/ad-categories/validation';
describe('editable specialist subcategory seed templates', () => {
  it('has unique keys and valid domain-specific definitions for each requested group', () => {
    expect(new Set(CATEGORY_SEED_TEMPLATES.map(t => t.key)).size).toBe(CATEGORY_SEED_TEMPLATES.length);
    expect(CATEGORY_SEED_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    for (const template of CATEGORY_SEED_TEMPLATES) {
      expect(validateDefinition(template.fields).length).toBeGreaterThanOrEqual(6);
      expect(template.fields.some(field => field.required), `${template.key} needs required fields`).toBe(true);
      expect(template.fields.some(field => !field.required), `${template.key} needs optional fields`).toBe(true);
    }
  });
  it('gives every subcategory its own precise field definition', () => {
    const fingerprints = CATEGORY_SEED_TEMPLATES.map(template => JSON.stringify(template.fields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      required: field.required,
    }))));
    expect(new Set(fingerprints).size).toBe(CATEGORY_SEED_TEMPLATES.length);
  });
  it('never offers used/new or sale-price fields for jobs, livestock, feed or plants', () => {
    for (const template of CATEGORY_SEED_TEMPLATES.filter(t => ['jobs', 'livestock', 'plants'].includes(t.kind))) {
      expect(template.goodsEnabled).toBe(false);
      expect(template.fields.some(f => f.key === 'condition')).toBe(false);
      if (template.kind === 'jobs') expect(template.priceEnabled).toBe(false);
    }
  });
  it('includes deeper land, villa and car attributes instead of a generic product form', () => {
    const keys = (key: string) => CATEGORY_SEED_TEMPLATES.find(t => t.key === key)!.fields.map(f => f.key);
    expect(keys('land')).toEqual(expect.arrayContaining(['land_use', 'terrain', 'area_m2', 'north_boundary', 'south_boundary', 'east_boundary', 'west_boundary']));
    expect(keys('villa')).toEqual(expect.arrayContaining(['rooms', 'bathrooms', 'floors', 'finish', 'rent_amount']));
    expect(keys('car')).toEqual(expect.arrayContaining(['make', 'model', 'year', 'odometer_km', 'specification', 'accident_history']));
    expect(CATEGORY_SEED_TEMPLATES.find(t => t.key === 'apartment')!.fields.filter(f => f.required).map(f => f.key))
      .toEqual(expect.arrayContaining(['area_m2', 'rooms', 'bathrooms', 'floor_number']));
    expect(CATEGORY_SEED_TEMPLATES.find(t => t.key === 'commercial_property')!.fields.map(f => f.key))
      .toEqual(expect.arrayContaining(['property_use', 'frontage_m', 'ceiling_height_m', 'loading_access']));
  });
});
