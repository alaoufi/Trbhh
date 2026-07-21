import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { searchAds, getCities, getAreas } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { SearchAreaPicker } from '@/components/search-area-picker';
import { toInt } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'قريب منك' };

export default async function NearbyPage({ searchParams }: { searchParams: Promise<{ city?: string; area?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const [allCities, areas] = await Promise.all([getCities(), getAreas()]);
  const cities = allCities.filter((c) => c.countryId === 1); // السعودية فقط

  // المنطقة المعروضة: من الرابط، وإلا منطقة العضو المسجّلة
  let cityId = sp.city ? Number(sp.city) : 0;
  const areaId = sp.area ? Number(sp.area) : 0;
  if (!cityId && session) {
    const u = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { city_id: true } }).catch(() => null);
    cityId = u?.city_id ? toInt(u.city_id) : 0;
  }
  const region = cities.find((c) => c.id === cityId);
  const area = areas.find((a) => a.id === areaId);
  const ads = cityId ? await searchAds({ cityId, areaId: areaId || undefined, take: 48 }) : [];
  const label = area?.name || region?.name || 'منطقتك';

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><MapPin className="h-6 w-6" /> قريب منك</h1>

      {/* اختيار المنطقة ثم المدينة — يظهر دائماً للتبديل السريع */}
      <form className="card-3d flex flex-wrap items-center gap-2 rounded-xl p-3">
        <SearchAreaPicker
          regions={cities}
          areas={areas}
          region={cityId ? String(cityId) : ''}
          area={areaId ? String(areaId) : ''}
          className="h-10 flex-1 rounded-lg border bg-background px-2 text-sm sm:max-w-[11rem]"
        />
        <button className="btn-3d h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">عرض</button>
      </form>

      {!cityId && (
        <p className="py-10 text-center text-muted-foreground">اختر منطقتك بالأعلى لعرض إعلاناتها{session ? '' : ' — وسجّل الدخول ليتذكّر الموقع منطقتك تلقائياً'}.</p>
      )}
      {cityId && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-foreground">إعلانات {label}</div>
            <span className="text-sm text-muted-foreground">{ads.length} إعلان</span>
          </div>
          {ads.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">لا توجد إعلانات في {label} بعد — <Link href="/ads/new" className="font-bold text-primary underline">كن أول من يعلن</Link>.</p>
          ) : (
            <AdGrid ads={ads} />
          )}
        </>
      )}
    </div>
  );
}
