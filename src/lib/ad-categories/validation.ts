export type CategoryFieldType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date';
export type CategoryField = {
  key: string; label: string; type: CategoryFieldType; group: string;
  required: boolean; visible: boolean; order: number;
  options: string[]; min?: number; max?: number; unit?: string;
};
export type CategoryValue = string | number | boolean | string[];
export type CategoryValues = Record<string, CategoryValue>;
const TYPES = new Set(['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class CategoryValidationError extends Error {
  constructor(public readonly fieldKey: string, message: string) { super(message); }
}

export function validateDefinition(raw: unknown): CategoryField[] {
  if (!Array.isArray(raw) || raw.length > 80) throw new CategoryValidationError('', 'تعريف الحقول غير صالح');
  const keys = new Set<string>();
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new CategoryValidationError('', 'تعريف حقل غير صالح');
    const f = item as Record<string, unknown>;
    const key = f.key;
    if (typeof key !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(key) || UNSAFE_KEYS.has(key) || keys.has(key)) {
      throw new CategoryValidationError('', 'معرف الحقل غير صالح أو مكرر');
    }
    keys.add(key);
    if (typeof f.label !== 'string' || !f.label.trim() || f.label.length > 120
      || typeof f.group !== 'string' || f.group.length > 100 || typeof f.type !== 'string' || !TYPES.has(f.type)
      || typeof f.required !== 'boolean' || typeof f.visible !== 'boolean'
      || !Number.isSafeInteger(f.order) || Number(f.order) < 0 || Number(f.order) > 10000) {
      throw new CategoryValidationError(key, 'خصائص الحقل غير صالحة');
    }
    if (!Array.isArray(f.options) || f.options.length > 200
      || f.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 120)) {
      throw new CategoryValidationError(key, 'خيارات الحقل غير صالحة');
    }
    const options = [...new Set((f.options as string[]).map(o => o.trim()))];
    if (['select', 'multiselect'].includes(String(f.type)) && !options.length) throw new CategoryValidationError(key, 'أضف خيارات الحقل');
    for (const prop of ['min', 'max'] as const) {
      if (f[prop] !== undefined && (typeof f[prop] !== 'number' || !Number.isFinite(f[prop]))) {
        throw new CategoryValidationError(key, 'حدود الحقل غير صالحة');
      }
    }
    if (typeof f.min === 'number' && typeof f.max === 'number' && f.min > f.max) throw new CategoryValidationError(key, 'الحد الأدنى أكبر من الأعلى');
    if (f.unit !== undefined && (typeof f.unit !== 'string' || f.unit.length > 30)) throw new CategoryValidationError(key, 'وحدة القياس غير صالحة');
    return { key, label: f.label.trim(), type: f.type as CategoryFieldType, group: f.group.trim(),
      required: f.required, visible: f.visible, order: f.order as number, options,
      ...(typeof f.min === 'number' ? { min: f.min } : {}), ...(typeof f.max === 'number' ? { max: f.max } : {}),
      ...(typeof f.unit === 'string' ? { unit: f.unit.trim() } : {}),
    };
  }).sort((a, b) => a.order - b.order);
}

function empty(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

export function validateCategoryValues(fields: CategoryField[], raw: unknown): CategoryValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 80) throw new CategoryValidationError('', 'بيانات الحقول غير صالحة');
  const input = raw as Record<string, unknown>;
  const active = new Map(fields.filter(f => f.visible).map(f => [f.key, f]));
  for (const key of Object.keys(input)) {
    if (!active.has(key) || UNSAFE_KEYS.has(key)) throw new CategoryValidationError(key, 'حقل غير متاح لهذا القسم الفرعي');
  }
  const out: CategoryValues = {};
  for (const f of active.values()) {
    const value = Object.hasOwn(input, f.key) ? input[f.key] : undefined;
    if (empty(value)) {
      if (f.required) throw new CategoryValidationError(f.key, `الحقل مطلوب: ${f.label}`);
      continue;
    }
    const fail = () => { throw new CategoryValidationError(f.key, `قيمة غير صالحة: ${f.label}`); };
    switch (f.type) {
      case 'number': {
        if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))) fail();
        const n = Number(value);
        if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) fail();
        out[f.key] = n;
        break;
      }
      case 'boolean':
        if (typeof value !== 'boolean') fail();
        out[f.key] = value as boolean;
        break;
      case 'select':
        if (typeof value !== 'string' || !f.options.includes(value)) fail();
        out[f.key] = value as string;
        break;
      case 'multiselect':
        if (!Array.isArray(value) || value.length > 200 || value.some(v => typeof v !== 'string' || !f.options.includes(v))) fail();
        out[f.key] = [...new Set(value as string[])];
        break;
      case 'date': {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
        const d = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail();
        out[f.key] = value as string;
        break;
      }
      default:
        if (typeof value !== 'string' || value.length > (f.type === 'textarea' ? 3000 : 500)) fail();
        out[f.key] = (value as string).trim();
    }
  }
  return out;
}

/** Preserve historical storage, but only render values compatible with today's definition. */
export function visibleCategoryValues(fields: CategoryField[], values: CategoryValues) {
  return fields.filter(f => f.visible && Object.hasOwn(values, f.key) && !empty(values[f.key]))
    .sort((a, b) => a.order - b.order)
    .flatMap(f => {
      try {
        const valid = validateCategoryValues([f], { [f.key]: values[f.key] });
        return [{ key: f.key, label: f.label, group: f.group, unit: f.unit, value: valid[f.key] }];
      } catch (error) {
        if (error instanceof CategoryValidationError) return [];
        throw error;
      }
    });
}
