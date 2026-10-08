'use client';
import React from 'react';
import type { CategoryField, CategoryValues, CategoryValue } from '@/lib/ad-categories/validation';

const control = 'mt-1 min-h-9 w-full rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30';

export function AdCategoryFields({ fields, values, onChange }: {
  fields: CategoryField[]; values: CategoryValues; onChange: (next: CategoryValues) => void;
}) {
  const active = fields.filter(f => f.visible).sort((a, b) => a.order - b.order);
  const current = Object.fromEntries(active.filter(f => Object.hasOwn(values, f.key)).map(f => [f.key, values[f.key]]));
  const groups = [...new Set(active.map(f => f.group))];
  function update(key: string, value: CategoryValue) { onChange({ ...current, [key]: value }); }

  function renderField(f: CategoryField) {
    const value = current[f.key];
    const id = `category-field-${f.key}`;
    const label = `${f.label}${f.unit ? ` (${f.unit})` : ''}${f.required ? ' *' : ''}`;
    return <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {f.type === 'select' || f.type === 'multiselect'
        ? <select id={id} className={control} required={f.required} multiple={f.type === 'multiselect'}
          value={f.type === 'multiselect' ? (Array.isArray(value) ? value : []) : String(value ?? '')}
          onChange={e => update(f.key, f.type === 'multiselect' ? [...e.currentTarget.selectedOptions].map(o => o.value) : e.target.value)}>
          {f.type === 'select' && <option value="">—</option>}
          {f.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        : f.type === 'boolean' ? <select id={id} className={control} required={f.required} value={typeof value === 'boolean' ? String(value) : ''}
          onChange={e => {
            if (!e.target.value) { const next = { ...current }; delete next[f.key]; onChange(next); }
            else update(f.key, e.target.value === 'true');
          }}><option value="">—</option><option value="true">نعم</option><option value="false">لا</option></select>
          : f.type === 'textarea' ? <textarea id={id} className={control} required={f.required} maxLength={3000} rows={3}
            value={String(value ?? '')} onChange={e => update(f.key, e.target.value)} />
            : <input id={id} className={control} required={f.required} type={f.type} min={f.min} max={f.max}
              step={f.type === 'number' ? 'any' : undefined} maxLength={f.type === 'text' ? 500 : undefined}
              value={String(value ?? '')} onChange={e => update(f.key, e.target.value)} />}
    </div>;
  }

  return <div className="space-y-3">
    <input type="hidden" name="category_values" value={JSON.stringify(current)} />
    {groups.map(group => {
      const groupFields = active.filter(f => f.group === group);
      const requiredFields = groupFields.filter(f => f.required);
      const optionalFields = groupFields.filter(f => !f.required);
      return <fieldset key={group} className="rounded-xl border border-primary/20 p-3">
        {group && <legend className="px-2 text-sm font-bold text-primary">{group}</legend>}
        {/* الحقول الإجبارية تبقى ظاهرة دائماً — لا تنكمش ولا تختفي (قاعدة). */}
        {requiredFields.length > 0 && <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">{requiredFields.map(renderField)}</div>}
        {/* الحقول الاختيارية المتشابهة تُجمع في صندوق قابل للطيّ والتمدّد (تسهيل الإدخال). */}
        {optionalFields.length > 0 && <details className={`group rounded-lg border border-primary/15 bg-primary/[0.03] ${requiredFields.length ? 'mt-2' : ''}`}>
          <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-primary">
            <span>حقول اختيارية{group ? ` — ${group}` : ''} ({optionalFields.length})</span>
            <span className="text-xs font-normal text-muted-foreground transition group-open:hidden">اضغط للعرض ▾</span>
            <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">طيّ ▴</span>
          </summary>
          <div className="grid gap-x-3 gap-y-2 px-3 pb-3 sm:grid-cols-2">{optionalFields.map(renderField)}</div>
        </details>}
      </fieldset>;
    })}
  </div>;
}
