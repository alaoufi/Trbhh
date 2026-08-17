export const INITIAL_ENTITY_KEYS = ['vehicle', 'property', 'livestock', 'product', 'service', 'equipment', 'other'] as const;
export type InitialEntityKey = typeof INITIAL_ENTITY_KEYS[number];
export type DynamicFieldType = 'text' | 'textarea' | 'number' | 'decimal' | 'select' | 'multiselect' | 'boolean' | 'date' | 'location' | 'media' | 'file' | 'url';

export type DynamicField = {
  id?: number;
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  searchable: boolean;
  options: string[];
  placeholder?: string;
  groupId?: number | null;
  inputOrder?: number;
  displayOrder?: number;
  inputVisible?: boolean;
  displayVisible?: boolean;
};

export type DynamicValuesResult = { ok: boolean; values: Record<string, string | number | boolean | string[]>; errors: Record<string, string> };

const validTypes = new Set<DynamicFieldType>(['text', 'textarea', 'number', 'decimal', 'select', 'multiselect', 'boolean', 'date', 'location', 'media', 'file', 'url']);
export function normalizeDynamicFieldLayout(input: { groupId?: number | null; inputOrder?: number; displayOrder?: number; inputVisible?: boolean; displayVisible?: boolean }) {
  return { groupId: Number.isSafeInteger(input.groupId) && (input.groupId ?? 0) > 0 ? input.groupId! : null, inputOrder: Math.max(0, Math.trunc(input.inputOrder ?? 999)), displayOrder: Math.max(0, Math.trunc(input.displayOrder ?? 999)), inputVisible: input.inputVisible !== false, displayVisible: input.displayVisible !== false };
}

/** Validate only fields declared by the selected entity. Never trust browser field names. */
export function validateDynamicValues(fields: DynamicField[], input: Record<string, unknown>): DynamicValuesResult {
  const values: Record<string, string | number | boolean | string[]> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.key) || !validTypes.has(field.type)) continue;
    const raw = input[field.key];
    if (field.type === 'multiselect') {
      const selected = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw]).map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
      if (!selected.length) { if (field.required) errors[field.key] = 'هذا الحقل مطلوب'; continue; }
      if (field.options.length && selected.some((value) => !field.options.includes(value))) { errors[field.key] = 'اختر قيماً من القائمة'; continue; }
      values[field.key] = selected;
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : raw === undefined || raw === null ? '' : String(raw).trim();
    if (!text) {
      if (field.required) errors[field.key] = 'هذا الحقل مطلوب';
      continue;
    }
    if (field.type === 'number' || field.type === 'decimal') {
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
