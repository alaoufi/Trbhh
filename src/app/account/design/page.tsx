'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, LayoutTemplate, ArrowRight, Megaphone } from 'lucide-react';
import { DESIGNS, applyDesign } from '@/components/design-picker';

// A small live sample rendered inside a data-design wrapper so its identity
// shows exactly as it would site-wide — a real preview before adopting.
function Preview({ id }: { id: string }) {
  if (id === 'list') {
    return (
      <div data-design="list" className="rounded-2xl bg-background p-3">
        <div className="card-3d flex items-stretch gap-3 rounded-2xl p-3">
          <div className="flex min-w-0 flex-1 flex-col pl-3">
            <div className="h-2.5 w-full rounded bg-foreground/15" />
            <div className="mt-1 h-2.5 w-2/3 rounded bg-foreground/10" />
            <div className="mt-2 text-base font-extrabold text-red-600">1,200 ر.س</div>
            <span className="mt-2 inline-flex w-fit rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-bold text-primary">عرض التفاصيل ←</span>
          </div>
          <span className="w-px self-stretch bg-primary/15" />
          <div className="aspect-square w-24 shrink-0 self-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-sm" />
        </div>
      </div>
    );
  }
  if (id === 'shop') {
    return (
      <div data-design="shop" className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-3">
        {[0, 1].map((i) => (
          <div key={i} className="card-3d flex flex-col overflow-hidden rounded-2xl">
            <div className="aspect-square w-full bg-gradient-to-br from-primary/20 to-primary/5" />
            <div className="space-y-1 p-2">
              <div className="h-2.5 w-full rounded bg-foreground/15" />
              <div className="h-2.5 w-2/3 rounded bg-foreground/10" />
              <div className="pt-1 text-sm font-extrabold text-red-600">{i ? '850' : '1,200'} ر.س</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const wrap = id === 'aurora'
    ? 'rounded-2xl p-3'
    : 'rounded-2xl bg-background p-3';
  const wrapStyle = id === 'aurora' ? { background: 'linear-gradient(160deg,#eef2ff,#fbeafe,#e6fbff)' } : undefined;
  return (
    <div data-design={id} className={wrap} style={wrapStyle}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.55)]" />
        <span className="text-sm font-extrabold text-primary">عنوان قسم</span>
      </div>
      <div className="card-3d rounded-2xl p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone className="h-6 w-6" /></span>
          <div><div className="font-bold text-primary">بطاقة إعلان</div><div className="text-xs text-muted-foreground">هكذا تظهر البطاقات في هذا القالب</div></div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.82)] px-3 py-1.5 text-xs font-bold text-white shadow">زر رئيسي</span>
          <span className="rounded-lg border-2 border-primary/30 px-3 py-1.5 text-xs font-bold text-primary">زر ثانوي</span>
        </div>
      </div>
    </div>
  );
}

export default function DesignGalleryPage() {
  const [current, setCurrent] = useState('');
  useEffect(() => { setCurrent(document.documentElement.getAttribute('data-design') || ''); }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><LayoutTemplate className="h-5 w-5" /> قوالب التصميم</h1>
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /> لوحة التحكم</Link>
      </div>
      <p className="text-sm text-muted-foreground">اختر الهوية البصرية التي تناسبك. المعاينة أدناه تُظهر شكل البطاقات فعلياً قبل الاعتماد، ويبقى «ثلاثي الأبعاد» هو الافتراضي.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DESIGNS.map((d) => {
          const active = current === d.id;
          return (
            <div key={d.id || 'default'} className={`card-3d space-y-3 rounded-2xl p-3 ${active ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div><div className="font-extrabold text-primary">{d.name}</div><div className="text-xs text-muted-foreground">{d.desc}</div></div>
                {active && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"><Check className="h-3.5 w-3.5" /> الحالي</span>}
              </div>
              <Preview id={d.id} />
              <button
                onClick={() => { applyDesign(d.id); setCurrent(d.id); }}
                disabled={active}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {active ? 'قالبك الحالي' : 'اعتماد هذا القالب'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">يُطبَّق القالب على الموقع كله فور الاعتماد، ويمكنك تغييره في أي وقت من هنا أو من القائمة.</p>
    </div>
  );
}
