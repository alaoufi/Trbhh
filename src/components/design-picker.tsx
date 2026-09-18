'use client';
import Link from 'next/link';
import { type SiteDesignConfig } from '@/lib/site-design';
import { useSiteDesign } from './site-design-provider';
export { applyDesign } from '@/lib/site-design-preference';
import { Check, LayoutTemplate } from 'lucide-react';

export const DESIGNS: { id: string; name: string; desc: string }[] = [
  { id: '', name: 'ثلاثي الأبعاد', desc: 'الحالي — بطاقات بارزة بإطار وظلّ' },
  { id: 'aurora', name: 'فضاء (Aurora)', desc: 'خلفية متدرّجة وبطاقات عائمة ورأس زجاجي' },
  { id: 'shop', name: 'متجر (شبكة)', desc: 'صورة كبيرة وسعر أحمر بارز بعمودين' },
  { id: 'list', name: 'قائمة (صورة يسار)', desc: 'صورة كبيرة يسار وتفاصيل وسعر يمين' },
  { id: 'flat', name: 'مسطّح عصري', desc: 'حدود رفيعة وظلّ خفيف وزوايا مرتّبة' },
  { id: 'soft', name: 'ناعم', desc: 'بلا حدود، ظلال ناعمة، زوايا دائرية' },
  { id: 'sharp', name: 'جريء', desc: 'زوايا حادّة وشريط جانبي وظلّ صلب' },
];

export function availableDesigns(config: SiteDesignConfig) {
  return config.enabled
    ? [...DESIGNS, { id: 'v2', name: config.label, desc: config.description }]
    : DESIGNS;
}

export function DesignPicker() {
  const { config, selected: current, selectDesign } = useSiteDesign();
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
        <LayoutTemplate className="h-4 w-4 text-primary" /> قالب التصميم (هوية الموقع)
      </div>
      <div className="grid grid-cols-2 gap-2">
        {availableDesigns(config).map((d) => {
          const active = current === d.id;
          return (
            <button
              key={d.id || 'default'}
              type="button"
              aria-pressed={active}
              onClick={() => selectDesign(d.id)}
              className={`flex items-start gap-1.5 rounded-lg border px-2 py-2 text-right text-xs transition ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:bg-accent'}`}
            >
              {active ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0"><span className="block font-bold text-primary">{d.name}</span><span className="block truncate text-[10px] text-muted-foreground">{d.desc}</span></span>
            </button>
          );
        })}
      </div>
      <Link href="/account/design" className="mt-2 block rounded-lg bg-primary/10 px-3 py-1.5 text-center text-xs font-bold text-primary hover:bg-primary/15">معاينة القوالب قبل الاعتماد ←</Link>
    </div>
  );
}
