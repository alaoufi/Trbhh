import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INITIAL_ENTITY_KEYS, validateDynamicValues } from '@/lib/dynamic-ads/schema';

describe('dynamic advertisement schema', () => {
  it('ships the seven initial entity templates', () => {
    expect(INITIAL_ENTITY_KEYS).toEqual(['vehicle', 'property', 'livestock', 'product', 'service', 'equipment', 'other']);
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
  });
});
