export const INITIAL_ENTITY_KEYS = ['vehicle', 'property', 'livestock', 'product', 'service', 'equipment', 'other'] as const;
export type InitialEntityKey = typeof INITIAL_ENTITY_KEYS[number];
export type DynamicFieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date' | 'location' | 'media';

export type DynamicField = {
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  searchable: boolean;
  options: string[];
};

export type DynamicValuesResult = { ok: boolean; values: Record<string, string | number | boolean>; errors: Record<string, string> };

const validTypes = new Set<DynamicFieldType>(['text', 'textarea', 'number', 'select', 'boolean', 'date', 'location', 'media']);

/** Validate only fields declared by the selected entity. Never trust browser field names. */
export function validateDynamicValues(fields: DynamicField[], input: Record<string, unknown>): DynamicValuesResult {
  const values: Record<string, string | number | boolean> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.key) || !validTypes.has(field.type)) continue;
    const raw = input[field.key];
    const text = typeof raw === 'string' ? raw.trim() : raw === undefined || raw === null ? '' : String(raw).trim();
    if (!text) {
      if (field.required) errors[field.key] = 'هذا الحقل مطلوب';
      continue;
    }
    if (field.type === 'number') {
      const value = Number(text);
      if (!Number.isFinite(value)) { errors[field.key] = 'أدخل رقماً صحيحاً'; continue; }
      values[field.key] = value;
      continue;
    }
    if (field.type === 'boolean') {
      values[field.key] = text === '1' || text === 'true' || text === 'on';
      continue;
    }
    if (field.type === 'select' && field.options.length && !field.options.includes(text)) {
      errors[field.key] = 'اختر قيمة من القائمة';
      continue;
    }
    values[field.key] = text.slice(0, field.type === 'textarea' ? 4000 : 255);
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}
