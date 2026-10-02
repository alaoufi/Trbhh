import Link from 'next/link';
import { ChevronDown, MapPin, Search } from 'lucide-react';
import { searchAds, countSearchAds, getCities, getAreas } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { SearchAreaPicker } from '@/components/search-area-picker';
import { normalizeSaudiAreaSelection, positiveSearchId } from '@/lib/search-filters';
import { AdminPager } from '@/components/admin-pager';
import { NearbyGpsResults } from '@/components/nearby-gps-results';
import { publicPageMetadata } from '@/lib/public-metadata';

export const dynamic = 'force-dynamic';
export const metadata = publicPageMetadata({
  title: 'قريب منك',
  description: 'اكتشف إعلانات تربح القريبة منك حسب موقع تختاره أو بإذن موقعك الاختياري.',
  path: '/nearby',
});

export default async function NearbyPage({ searchParams }: { searchParams: Promise<{ city?: string; area?: string; page?: string }> }) {
  const sp = await searchParams;
  const [allCities, areas] = await Promise.all([getCities(), getAreas()]);
  const cities = allCities.filter((c) => c.countryId === 1); // السعودية فقط

  // الاختيار من الرابط فقط؛ إحداثيات الزائر تبقى في جلسة المتصفح.
  const {cityId,areaId}=normalizeSaudiAreaSelection(cities,areas,sp.city,sp.area);
  const region = cities.find((c) => c.id === cityId);
  const area = areas.find((a) => a.id === areaId && a.cityId === cityId);
  const pageSize=48;
  const total=cityId?await countSearchAds({cityId,areaId,geoTrustedOnly:true}):0;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(positiveSearchId(sp.page)||1,pages);
  const ads = cityId ? await searchAds({ cityId, areaId, geoTrustedOnly:true,take: pageSize,skip:(page-1)*pageSize }) : [];
  const label = area?.name || region?.name || 'منطقتك';

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><MapPin className="h-6 w-6" /> قريب منك</h1>

      <NearbyGpsResults />

      {/* البحث النصي يبقى مضغوطاً حتى يطلبه الزائر، لتتقدم الإعلانات بصرياً. */}
      <details className="group card-3d rounded-xl [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-primary">
          <span className="flex items-center gap-2"><Search className="h-4 w-4" /> بحث</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <form className="flex flex-wrap items-center gap-2 border-t border-primary/10 p-3">
          <SearchAreaPicker
            regions={cities}
            areas={areas}
            region={cityId ? String(cityId) : ''}
            area={areaId ? String(areaId) : ''}
            className="h-10 flex-1 rounded-lg border bg-background px-2 text-sm sm:max-w-[11rem]"
          />
          <button className="btn-3d h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">عرض</button>
        </form>
      </details>

      {!cityId && (
        <p className="py-10 text-center text-muted-foreground">يمكنك اختيار المنطقة والمدينة من «بحث»، أو استخدام موقعك اختياريًا لعرض الأقرب. لا يلزم تسجيل الدخول أو مشاركة موقعك للتصفح.</p>
      )}
      {cityId && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-foreground">إعلانات {label}</div>
            <span className="text-sm text-muted-foreground">{total} إعلان</span>
          </div>
          {ads.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">لا توجد إعلانات في {label} بعد — <Link href="/ads/new" className="font-bold text-primary underline">كن أول من يعلن</Link>.</p>
          ) : (
            <AdGrid ads={ads} />
          )}
          {total>0&&<AdminPager basePath="/nearby" page={page} pages={pages} total={total} params={{city:String(cityId),area:areaId?String(areaId):undefined}}/>}
        </>
      )}
    </div>
  );
}
