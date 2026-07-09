import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { searchAds, getCities } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { toInt } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'قريب منك' };

export default async function NearbyPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const cities = await getCities();

  // مدينة العرض: من الرابط، وإلا مدينة العضو المسجّلة
  let cityId = sp.city ? Number(sp.city) : 0;
  if (!cityId && session) {
    const u = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { city_id: true } }).catch(() => null);
    cityId = u?.city_id ? toInt(u.city_id) : 0;
  }
  const city = cities.find((c) => c.id === cityId);
  const ads = cityId ? await searchAds({ cityId, take: 48 }) : [];

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><MapPin className="h-6 w-6" /> قريب منك</h1>

      {/* اختيار المدينة — يظهر دائماً للتبديل السريع */}
      <form className="card-3d flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="text-sm font-bold">المدينة:</span>
        <select name="city" defaultValue={cityId || ''} className="h-10 flex-1 rounded-lg border bg-background px-2 text-sm sm:max-w-xs">
          <option value="">اختر مدينتك…</option>
          {cities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <button className="btn-3d h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">عرض</button>
      </form>

      {!cityId && (
        <p className="py-10 text-center text-muted-foreground">اختر مدينتك بالأعلى لعرض إعلاناتها{session ? '' : ' — وسجّل الدخول ليتذكّر الموقع مدينتك تلقائياً'}.</p>
      )}
      {cityId && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-foreground">إعلانات {city?.name || 'مدينتك'}</div>
            <span className="text-sm text-muted-foreground">{ads.length} إعلان</span>
          </div>
          {ads.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">لا توجد إعلانات في هذه المدينة بعد — <Link href="/ads/new" className="font-bold text-primary underline">كن أول من يعلن</Link>.</p>
          ) : (
            <AdGrid ads={ads} />
          )}
        </>
      )}
    </div>
  );
}
