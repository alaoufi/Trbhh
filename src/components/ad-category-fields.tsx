'use client';
import React from 'react';
import { fieldApplies, type CategoryField, type CategoryValues, type CategoryValue, type CategoryRange } from '@/lib/ad-categories/validation';

const controlBase = 'mt-1 h-9 min-h-9 w-full rounded-lg border bg-white px-2 py-1 text-sm outline-none transition-colors focus:ring-2';

function controlClass(invalid: boolean, multiline = false) {
  return `${controlBase} ${multiline ? 'h-auto min-h-20 py-2' : ''} ${invalid
    ? 'border-red-600 ring-2 ring-red-200 focus:border-red-600 focus:ring-red-200'
    : 'border-primary/25 focus:border-primary/50 focus:ring-primary/30'}`;
}

export function AdCategoryFields({ fields, values, onChange, listingType }: {
  fields: CategoryField[];
  values: CategoryValues;
  onChange: (next: CategoryValues) => void;
  listingType?: string;
}) {
  const [invalidKeys, setInvalidKeys] = React.useState<Set<string>>(() => new Set());
  const active = fields.filter(f => fieldApplies(f, { listingType, values })).sort((a, b) => a.order - b.order);
  const current = Object.fromEntries(active.filter(f => Object.hasOwn(values, f.key)).map(f => [f.key, values[f.key]]));
  const groups = [...new Set(active.map(f => f.group))];

  function markInvalid(key: string) {
    setInvalidKeys(previous => previous.has(key) ? previous : new Set(previous).add(key));
  }

  function clearInvalid(key: string) {
    setInvalidKeys(previous => {
      if (!previous.has(key)) return previous;
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  }

  function update(key: string, value: CategoryValue) {
    clearInvalid(key);
    onChange({ ...current, [key]: value });
  }

  return <div className="space-y-2">
    <input type="hidden" name="category_values" value={JSON.stringify(current)} />
    {groups.map(group => <fieldset key={group} data-field-group={group || 'عام'} className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 shadow-sm">
      {group && <legend className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-white">{group}</legend>}
      <div className="grid gap-2 sm:grid-cols-2">
        {active.filter(f => f.group === group).map(f => {
          const value = current[f.key];
          const id = `category-field-${f.key}`;
          const errorId = `${id}-error`;
          const label = `${f.label}${f.unit ? ` (${f.unit})` : ''}`;
          const invalid = invalidKeys.has(f.key);
          const fieldCard = `${f.type === 'textarea' ? 'sm:col-span-2' : ''} rounded-lg border p-2 transition-colors ${invalid
            ? 'border-red-500 bg-red-100/80 ring-1 ring-red-300'
            : f.required
              ? 'border-red-200 bg-red-50/70'
              : 'border-emerald-200 bg-emerald-50/60'}`;
          const invalidProps = {
            'aria-invalid': invalid || undefined,
            'aria-describedby': invalid ? errorId : undefined,
            onInvalid: () => markInvalid(f.key),
          };

          return <div key={f.key} data-field-key={f.key} data-required={String(f.required)} data-invalid={String(invalid)} className={fieldCard}>
            <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
              <span>{label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${f.required ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {f.required ? 'مطلوب' : 'اختياري'}
              </span>
            </label>
            {f.type === 'select' || f.type === 'multiselect'
              ? <select id={id} className={controlClass(invalid)} required={f.required} multiple={f.type === 'multiselect'} {...invalidProps}
                value={f.type === 'multiselect' ? (Array.isArray(value) ? value : []) : String(value ?? '')}
                onChange={e => update(f.key, f.type === 'multiselect' ? [...e.currentTarget.selectedOptions].map(o => o.value) : e.target.value)}>
                {f.type !== 'multiselect' && <option value="">—</option>}
                {f.options.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              : f.type === 'radio' ? <div className="mt-1.5 flex flex-wrap gap-1.5" role="group">
                {f.options.map((option, index) => <label key={option} className={`rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${value === option ? 'border-primary bg-primary/10' : 'border-slate-200 bg-white'}`}>
                  <input id={index === 0 ? id : undefined} type="radio" name={`category_${f.key}`} required={f.required} checked={value === option} {...invalidProps} onChange={() => update(f.key, option)} className="ml-1" />
                  {option}
                </label>)}
              </div>
              : f.type === 'boolean' ? <select id={id} className={controlClass(invalid)} required={f.required} {...invalidProps} value={typeof value === 'boolean' ? String(value) : ''}
                onChange={e => {
                  clearInvalid(f.key);
                  if (!e.target.value) {
                    const next = { ...current };
                    delete next[f.key];
                    onChange(next);
                  } else update(f.key, e.target.value === 'true');
                }}><option value="">—</option><option value="true">نعم</option><option value="false">لا</option></select>
                : f.type === 'textarea' ? <textarea id={id} className={controlClass(invalid, true)} required={f.required} {...invalidProps} maxLength={3000} rows={3} placeholder={f.placeholder}
                  value={String(value ?? '')} onChange={e => update(f.key, e.target.value)} />
                  : f.type === 'range' ? <div className="grid grid-cols-2 gap-2">
                    <input id={id} aria-label={`${f.label} من`} className={controlClass(invalid)} type="number" required={f.required} {...invalidProps} min={f.min} max={f.max} value={String((value as CategoryRange | undefined)?.min ?? '')} onChange={e => update(f.key, { min: Number(e.target.value), max: Number((value as CategoryRange | undefined)?.max ?? e.target.value) })} />
                    <input id={`${id}-max`} aria-label={`${f.label} إلى`} className={controlClass(invalid)} type="number" required={f.required} {...invalidProps} min={f.min} max={f.max} value={String((value as CategoryRange | undefined)?.max ?? '')} onChange={e => update(f.key, { min: Number((value as CategoryRange | undefined)?.min ?? e.target.value), max: Number(e.target.value) })} />
                  </div>
                    : <input id={id} className={controlClass(invalid)} required={f.required} {...invalidProps} type={f.type === 'year' ? 'number' : f.type} min={f.min} max={f.max}
                      placeholder={f.placeholder} step={f.type === 'number' || f.type === 'decimal' ? 'any' : undefined} maxLength={f.type === 'text' ? 500 : undefined}
                      value={String(value ?? '')} onChange={e => update(f.key, e.target.value)} />}
            {invalid && <p id={errorId} role="alert" className="mt-1 text-xs font-bold text-red-700">هذا الحقل مطلوب قبل المتابعة.</p>}
            {f.helpText && <p className="mt-1 text-xs text-muted-foreground">{f.helpText}</p>}
          </div>;
        })}
      </div>
    </fieldset>)}
  </div>;
}
