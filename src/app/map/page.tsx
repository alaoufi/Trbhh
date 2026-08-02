import Link from 'next/link';
import { MapPin, Plus, Search } from 'lucide-react';
import { getMapAds, getCities, type RealEstateFilters } from '@/lib/data';
import { ListingsMapEmbed } from '@/components/maps-embed';
import { RE_TYPES } from '@/lib/realestate-types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'خريطة العقارات' };

type SP = Record<string, string | undefined>;

export default async function MapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const num = (v?: string) => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const filters: RealEstateFilters = {
    type: sp.type || undefined,
    purpose: sp.purpose === 'rent' || sp.purpose === 'sale' ? sp.purpose : undefined,
    cityId: num(sp.city),
    priceMin: num(sp.pmin), priceMax: num(sp.pmax),
    areaMin: num(sp.amin), areaMax: num(sp.amax),
    beds: num(sp.beds),
  };
  const [points, cities] = await Promise.all([
    getMapAds(filters).catch(() => []),
    getCities().catch(() => []),
  ]);
  const hasFilters = Object.values(filters).some((v) => v !== undefined);
  const field = 'h-10 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary">
          <MapPin className="h-5 w-5" /> خريطة العقارات
        </h1>
        <Link href="/ads/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> أضف عقار
        </Link>
      </div>

      {/* فلاتر عقارية — نموذج GET يحدّث رابط الصفحة فتُعاد التصفية على الخادم */}
      <form method="get" className="card-3d grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-4">
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">نوع العقار</span>
          <select name="type" defaultValue={sp.type || ''} className={field}>
            <option value="">كل الأنواع</option>
            {RE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">الغرض</span>
          <select name="purpose" defaultValue={sp.purpose || ''} className={field}>
            <option value="">بيع وإيجار</option>
            <option value="sale">للبيع</option>
            <option value="rent">للإيجار</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">المدينة</span>
          <select name="city" defaultValue={sp.city || ''} className={field}>
            <option value="">كل المدن</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">أقل عدد غرف</span>
          <input name="beds" type="number" min="0" defaultValue={sp.beds || ''} className={field} placeholder="أي عدد" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">السعر من</span>
          <input name="pmin" type="number" min="0" defaultValue={sp.pmin || ''} className={field} placeholder="ر.س" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">السعر إلى</span>
          <input name="pmax" type="number" min="0" defaultValue={sp.pmax || ''} className={field} placeholder="ر.س" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">المساحة من (م²)</span>
          <input name="amin" type="number" min="0" defaultValue={sp.amin || ''} className={field} placeholder="م²" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">المساحة إلى (م²)</span>
          <input name="amax" type="number" min="0" defaultValue={sp.amax || ''} className={field} placeholder="م²" />
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          <button className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white">
            <Search className="h-4 w-4" /> تطبيق الفلاتر
          </button>
          {hasFilters && (
            <Link href="/map" className="inline-flex items-center justify-center rounded-lg border-2 border-primary/30 px-3 py-2 text-sm font-bold text-primary">
              مسح
            </Link>
          )}
        </div>
      </form>

      {points.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {hasFilters ? 'لا توجد عقارات مطابقة للفلاتر المختارة — جرّب توسيع البحث.' : 'لا توجد عقارات محدَّدة الموقع على الخريطة بعد. عند إضافة عقار حدِّد موقعه ليظهر هنا.'}
        </div>
      ) : (
        <>
          <ListingsMapEmbed points={points} />
          <div className="text-center text-[11px] text-muted-foreground">
            يظهر {points.length} عقاراً {hasFilters ? 'مطابقاً للفلاتر' : 'لها موقع محدَّد'}. لون الدبّوس:{' '}
            <span className="font-bold text-emerald-700">بيع</span> · <span className="font-bold text-sky-700">إيجار</span> ·{' '}
            <span className="font-bold text-amber-700">سوم</span>.
          </div>
        </>
      )}
    </div>
  );
}
