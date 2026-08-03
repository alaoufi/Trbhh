import Link from 'next/link';
import { Search, MapPin, SlidersHorizontal } from 'lucide-react';
import { searchAds, getCities } from '@/lib/data';
import { RE_TYPES } from '@/lib/realestate-types';
import { PropertyGrid } from '@/components/property-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'العقارات' };

type SP = Record<string, string | undefined>;

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const num = (v?: string) => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const purpose: 'rent' | 'sale' | undefined = sp.purpose === 'rent' ? 'rent' : sp.purpose === 'sale' ? 'sale' : undefined;
  const params = {
    reType: sp.type || undefined,
    purpose,
    cityId: num(sp.city),
    priceMin: num(sp.pmin), priceMax: num(sp.pmax),
    areaMin: num(sp.amin), areaMax: num(sp.amax),
    beds: num(sp.beds),
    sort: (sp.sort === 'price_asc' || sp.sort === 'price_desc' ? sp.sort : 'newest') as 'newest' | 'price_asc' | 'price_desc',
    take: 48,
  };
  const [ads, cities] = await Promise.all([searchAds(params).catch(() => []), getCities().catch(() => [])]);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type: sp.type, city: sp.city, pmin: sp.pmin, pmax: sp.pmax, amin: sp.amin, amax: sp.amax, beds: sp.beds, ...extra })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  const purposeTab = (val: string | undefined, label: string) => {
    const active = (sp.purpose || '') === (val || '');
    return <Link href={`/properties${qs({ purpose: val || '' })}`} className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-bold transition ${active ? 'bg-primary text-white shadow-sm' : 'text-foreground/70 hover:text-primary'}`}>{label}</Link>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">العقارات</h1>
        <Link href={`/map${qs({ purpose: sp.purpose || '' })}`} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-primary/30 px-3 py-2 text-sm font-bold text-primary"><MapPin className="h-4 w-4" /> عرض على الخريطة</Link>
      </div>

      {/* غرض: الكل / بيع / إيجار */}
      <div className="flex rounded-xl border-2 border-primary/20 bg-primary/5 p-1">
        {purposeTab(undefined, 'الكل')}
        {purposeTab('sale', 'للبيع')}
        {purposeTab('rent', 'للإيجار')}
      </div>

      {/* الفلاتر */}
      <form method="get" className="card-3d grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-4">
        {sp.purpose && <input type="hidden" name="purpose" value={sp.purpose} />}
        <select name="type" defaultValue={sp.type || ''} className={field}><option value="">كل الأنواع</option>{RE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select name="city" defaultValue={sp.city || ''} className={field}><option value="">كل المدن</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input name="beds" type="number" min="0" defaultValue={sp.beds || ''} className={field} placeholder="أقل غرف" />
        <select name="sort" defaultValue={sp.sort || 'newest'} className={field}><option value="newest">الأحدث</option><option value="price_asc">الأقل سعراً</option><option value="price_desc">الأعلى سعراً</option></select>
        <input name="pmin" type="number" min="0" defaultValue={sp.pmin || ''} className={field} placeholder="السعر من" />
        <input name="pmax" type="number" min="0" defaultValue={sp.pmax || ''} className={field} placeholder="السعر إلى" />
        <input name="amin" type="number" min="0" defaultValue={sp.amin || ''} className={field} placeholder="المساحة من" />
        <input name="amax" type="number" min="0" defaultValue={sp.amax || ''} className={field} placeholder="المساحة إلى" />
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          <button className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"><Search className="h-4 w-4" /> بحث</button>
          <Link href="/properties" className="inline-flex items-center justify-center rounded-lg border-2 border-primary/30 px-3 py-2 text-sm font-bold text-primary"><SlidersHorizontal className="h-4 w-4" /></Link>
        </div>
      </form>

      <div className="text-xs text-muted-foreground">{ads.length} عقار</div>
      {ads.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">لا توجد عقارات مطابقة — وسّع نطاق البحث أو جرّب <Link href="/map" className="font-bold text-primary underline">الخريطة</Link>.</div>
      ) : (
        <PropertyGrid ads={ads} />
      )}
    </div>
  );
}
