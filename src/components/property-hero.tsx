import Link from 'next/link';
import { Search } from 'lucide-react';
import { RE_TYPES } from '@/lib/realestate-types';
import { getReTypesDisplay } from '@/lib/settings';

const CATS: { t: string; e: string }[] = [
  { t: 'شقة', e: '🏢' }, { t: 'فيلا', e: '🏡' }, { t: 'أرض', e: '🗺️' }, { t: 'عمارة', e: '🏬' },
  { t: 'دور', e: '🏠' }, { t: 'استراحة', e: '🌴' }, { t: 'محل تجاري', e: '🏪' }, { t: 'مكتب', e: '💼' },
  { t: 'مستودع', e: '📦' }, { t: 'مزرعة', e: '🌾' },
];

/** واجهة بحث عقارية بأسلوب تطبيقات العقار: غرض + نوع + مدينة + تصنيفات سريعة. */
export async function PropertyHero({ cities }: { cities: { id: number; name: string }[] }) {
  const disp = await getReTypesDisplay(); // كتابة فقط / كتابة+أيقونة / أيقونة فقط
  const field = 'h-10 w-full rounded-lg border-0 bg-white px-2 text-sm font-medium text-foreground outline-none';
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl bg-gradient-to-l from-primary to-[hsl(var(--primary)/0.75)] p-4 shadow-md">
        <div className="mb-2 text-lg font-extrabold text-white">ابحث عن عقارك 🏙️</div>
        <form method="get" action="/properties" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select name="purpose" defaultValue="" className={field}>
            <option value="">بيع وإيجار</option>
            <option value="sale">للبيع</option>
            <option value="rent">للإيجار</option>
          </select>
          <select name="type" defaultValue="" className={field}>
            <option value="">نوع العقار</option>
            {RE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select name="city" defaultValue="" className={field}>
            <option value="">المدينة</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#f0b429] px-3 text-sm font-extrabold text-[#16294a]">
            <Search className="h-4 w-4" /> بحث
          </button>
        </form>
      </div>

      {/* تصنيفات سريعة بأنواع العقار */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATS.map((c) => (
          <Link key={c.t} href={`/properties?type=${encodeURIComponent(c.t)}`}
            className="flex shrink-0 flex-col items-center gap-1 rounded-xl border-2 border-primary/15 bg-white px-3 py-2 text-[11px] font-bold text-foreground/80 shadow-sm transition hover:border-primary hover:text-primary">
            {disp !== 'text' && <span className={disp === 'icon' ? 'text-2xl' : 'text-xl'}>{c.e}</span>}
            {disp !== 'icon' && <span>{c.t}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
