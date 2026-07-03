'use client';
import { useEffect, useState } from 'react';
import { Check, LayoutTemplate } from 'lucide-react';

export const DESIGNS: { id: string; name: string; desc: string }[] = [
  { id: '', name: 'ثلاثي الأبعاد', desc: 'الحالي — بطاقات بارزة بإطار وظلّ' },
  { id: 'flat', name: 'مسطّح عصري', desc: 'حدود رفيعة وظلّ خفيف وزوايا مرتّبة' },
  { id: 'soft', name: 'ناعم', desc: 'بلا حدود، ظلال ناعمة، زوايا دائرية' },
  { id: 'sharp', name: 'جريء', desc: 'زوايا حادّة وشريط جانبي وظلّ صلب' },
];

export function applyDesign(id: string) {
  const el = document.documentElement;
  if (id) el.setAttribute('data-design', id);
  else el.removeAttribute('data-design');
  document.cookie = `design=${id}; path=/; max-age=31536000; samesite=lax`;
}

export function DesignPicker() {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    setCurrent(document.documentElement.getAttribute('data-design') || '');
  }, []);
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
        <LayoutTemplate className="h-4 w-4 text-primary" /> قالب التصميم (هوية الموقع)
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DESIGNS.map((d) => {
          const active = current === d.id;
          return (
            <button
              key={d.id || 'default'}
              type="button"
              onClick={() => { applyDesign(d.id); setCurrent(d.id); }}
              className={`flex items-start gap-1.5 rounded-lg border px-2 py-2 text-right text-xs transition ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:bg-accent'}`}
            >
              {active ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0"><span className="block font-bold text-primary">{d.name}</span><span className="block truncate text-[10px] text-muted-foreground">{d.desc}</span></span>
            </button>
          );
        })}
      </div>
      <a href="/account/design" className="mt-2 block rounded-lg bg-primary/10 px-3 py-1.5 text-center text-xs font-bold text-primary hover:bg-primary/15">معاينة القوالب قبل الاعتماد ←</a>
    </div>
  );
}
