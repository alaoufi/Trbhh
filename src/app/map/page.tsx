import Link from 'next/link';
import { MapPin, Plus } from 'lucide-react';
import { getMapAds } from '@/lib/data';
import { ListingsMapEmbed } from '@/components/maps-embed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'خريطة العقارات' };

export default async function MapPage() {
  const points = await getMapAds().catch(() => []);
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
      <p className="text-xs text-muted-foreground">
        تصفّح العقارات على الخريطة — بدّل إلى «قمر صناعي» لرؤية الأرض والقطعة على الطبيعة. اضغط على أي دبّوس لفتح العقار.
      </p>
      {points.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">
          لا توجد عقارات محدَّدة الموقع على الخريطة بعد. عند إضافة عقار حدِّد موقعه ليظهر هنا.
        </div>
      ) : (
        <>
          <ListingsMapEmbed points={points} />
          <div className="text-center text-[11px] text-muted-foreground">
            يظهر {points.length} عقاراً لها موقع محدَّد. لون الدبّوس: <span className="font-bold text-emerald-700">بيع</span> ·{' '}
            <span className="font-bold text-sky-700">إيجار</span> · <span className="font-bold text-amber-700">سوم</span>.
          </div>
        </>
      )}
    </div>
  );
}
