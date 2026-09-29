import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ENTITY_FIELDS, INITIAL_ENTITY_KEYS, normalizeDynamicFieldLayout, validateDynamicValues } from '@/lib/dynamic-ads/schema';

describe('dynamic advertisement schema', () => {
  it('ships the seven initial entity templates', () => {
    expect(INITIAL_ENTITY_KEYS).toEqual(['vehicle', 'property', 'livestock', 'product', 'service', 'equipment', 'agriculture', 'livestock_supplies', 'household', 'home_decor', 'construction', 'heavy_transport', 'vehicle_parts', 'other']);
  });

  it('rejects a missing required field and normalises a number value', () => {
    const result = validateDynamicValues([
      { key: 'brand', label: 'الشركة المصنعة', type: 'text', required: true, searchable: true, options: [] },
      { key: 'year', label: 'السنة', type: 'number', required: false, searchable: true, options: [] },
    ], { brand: '', year: '2020' });

    expect(result.ok).toBe(false);
    expect(result.errors.brand).toBe('هذا الحقل مطلوب');
    expect(result.values.year).toBe(2020);
  });

  it('uses idempotent SQL tables and unique schema keys', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database/2026-08-17-dynamic-ads.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS dynamic_entities');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS dynamic_entity_fields');
    expect(sql).toContain('UNIQUE KEY dynamic_entity_key');
    expect(sql).toContain('UNIQUE KEY dynamic_entity_field_key');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS dynamic_entity_groups');
    const repository = fs.readFileSync(path.join(process.cwd(), 'src/lib/dynamic-ads/repository.ts'), 'utf8');
    expect(repository).toContain("'input_visible_flag'");
    expect(repository).toContain("'display_visible_flag'");
  });

  it('validates selected multiple options and preserves their order', () => {
    const field = { key: 'fuel', label: 'الوقود', type: 'multiselect' as const, required: true, searchable: true, options: ['بنزين', 'ديزل', 'كهرباء'] };
    const allowed = validateDynamicValues([field], { fuel: ['كهرباء', 'بنزين'] });
    const rejected = validateDynamicValues([field], { fuel: ['بنزين', 'غير صالح'] });
    expect(allowed.ok).toBe(true);
    expect(allowed.values.fuel).toEqual(['كهرباء', 'بنزين']);
    expect(rejected.errors.fuel).toBeDefined();
  });

  it('normalises independent input and display ordering for a field', () => {
    expect(normalizeDynamicFieldLayout({ groupId: 3, inputOrder: 20, displayOrder: 5, inputVisible: true, displayVisible: false })).toEqual({ groupId: 3, inputOrder: 20, displayOrder: 5, inputVisible: true, displayVisible: false });
  });

  it('defines the required default field catalogue without fixed advertisement columns', () => {
    expect(DEFAULT_ENTITY_FIELDS.vehicle.map((field) => field.key)).toEqual(expect.arrayContaining(['vehicle_type', 'manufacturer', 'model', 'year', 'fuel', 'transmission', 'notes']));
    expect(DEFAULT_ENTITY_FIELDS.property.map((field) => field.key)).toEqual(expect.arrayContaining(['property_type', 'offer_type', 'area_sqm', 'city', 'district', 'map_location', 'rooms']));
    expect(DEFAULT_ENTITY_FIELDS.livestock.map((field) => field.key)).toEqual(expect.arrayContaining(['livestock_type', 'breed', 'health_status', 'vaccinations', 'sire', 'dam']));
    expect(DEFAULT_ENTITY_FIELDS.agriculture.map((field) => field.key)).toEqual(expect.arrayContaining(['agriculture_type', 'irrigation', 'soil_type', 'area_sqm', 'production']));
    expect(DEFAULT_ENTITY_FIELDS.livestock_supplies.map((field) => field.key)).toEqual(expect.arrayContaining(['supply_type', 'brand', 'condition', 'quantity']));
    expect(DEFAULT_ENTITY_FIELDS.household.map((field) => field.key)).toEqual(expect.arrayContaining(['product_type', 'material', 'condition', 'quantity']));
    expect(DEFAULT_ENTITY_FIELDS.home_decor.map((field) => field.key)).toEqual(expect.arrayContaining(['decor_type', 'style', 'material', 'condition']));
    expect(DEFAULT_ENTITY_FIELDS.construction.map((field) => field.key)).toEqual(expect.arrayContaining(['material_type', 'grade', 'quantity', 'origin']));
    expect(DEFAULT_ENTITY_FIELDS.heavy_transport.map((field) => field.key)).toEqual(expect.arrayContaining(['equipment_type', 'manufacturer', 'model', 'year', 'hours']));
    expect(DEFAULT_ENTITY_FIELDS.vehicle_parts.map((field) => field.key)).toEqual(expect.arrayContaining(['part_type', 'vehicle_compatibility', 'condition', 'warranty']));
  });

  it('keeps interactive entity selection out of the server-rendered admin page', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/smart-ads/page.tsx'), 'utf8');
    expect(page).not.toContain('onChange=');
  });
});
