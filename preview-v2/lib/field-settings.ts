import type { Details, Field, Profile } from './category-fields';

export type FieldOverride = { label?: string; required?: boolean; hidden?: boolean; options?: string[] };
export type BranchSettings = { enabled?: boolean; fields?: Record<string, FieldOverride>; added?: Field[] };
export type FieldSettings = Record<string, BranchSettings>;
export const FIELD_SETTINGS_KEY = 'field-settings-v1';
export function normalizeOptions(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().slice(0,80)))].slice(0,50) : [];
}
export function optionsLocked(profile: Profile, id: string): boolean {
  return ['purpose','rentPeriod','rentalUnit','priceBasis','salaryPeriod','unit'].includes(id) || profile.fields.some(f => f.when?.field === id);
}
export function preserveStoredDetails(value: unknown): Details {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, v]) => /^[a-z][a-zA-Z0-9]*$/.test(id) && id !== 'constructor' && id !== 'prototype' && ((typeof v === 'string' && v.length <= 300) || (Array.isArray(v) && v.length <= 50 && v.every(item => typeof item === 'string' && item.length <= 300)))));
}
export function settingsErrors(profile: Profile, settings: BranchSettings): string[] {
  const errors: string[] = [];
  for (const f of [...profile.fields, ...(settings.added || [])]) {
    const override = settings.fields?.[f.id];
    if (!['select','multi'].includes(f.type) || override?.hidden) continue;
    if (!normalizeOptions(override?.options ?? f.options).length) errors.push(`أضف خياراً صالحاً واحداً على الأقل لحقل ${override?.label || f.label}.`);
  }
  return errors;
}
export function applyFieldSettings(profile: Profile | undefined, settings: BranchSettings = {}): Profile | undefined {
  if (!profile || settings?.enabled === false) return undefined;
  const added = Array.isArray(settings?.added) ? settings.added.slice(0, 30).filter(f => f && /^custom[0-9]+$/.test(f.id) && typeof f.label === 'string' && f.label.trim().length > 0 && f.label.length <= 80 && ['text','number','select','multi','date'].includes(f.type)).map(f => ({ id:f.id, label:f.label, type:f.type, group:'تفاصيل إضافية', required:f.required === true, ...(f.type === 'number' ? {min:0,max:1000000} : {}), ...(['select','multi'].includes(f.type) ? {options:normalizeOptions(f.options)} : {}) } as Field)).filter(f => !['select','multi'].includes(f.type) || f.options?.length) : [];
  const seen = new Set<string>();
  let fields = [...profile.fields, ...added].filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; }).flatMap(f => {
    const override = settings?.fields && Object.hasOwn(settings.fields, f.id) ? settings.fields[f.id] : undefined;
    if (override?.hidden === true) return [];
    const options = normalizeOptions(override?.options);
    return [{ ...f, ...(typeof override?.label === 'string' && override.label.trim() ? {label:override.label.trim().slice(0,80)} : {}), ...(typeof override?.required === 'boolean' ? {required:override.required} : {}), ...(options.length && !optionsLocked(profile,f.id) && ['select','multi'].includes(f.type) ? {options} : {}) }];
  });
  // Hiding a controller must also hide its dependent fields, including transitive dependencies.
  for (let i=0; i<profile.fields.length; i++) {
    const ids = new Set(fields.map(f => f.id));
    const next = fields.filter(f => !f.when || ids.has(f.when.field));
    if (next.length === fields.length) break;
    fields = next;
  }
  return { ...profile, fields };
}
