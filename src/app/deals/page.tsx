import { notFound } from 'next/navigation';
import { Flame } from 'lucide-react';
import { getDealAds } from '@/lib/data';
import { dealsEnabled } from '@/lib/store-extras';
import { AdGrid } from '@/components/ad-card';
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'عروض اليوم', description: 'أقوى التخفيضات والعروض الحالية على منصة تربح' };

/** عروض اليوم: كل إعلان حدد معلنه «سعراً قبل الخصم» أعلى من سعره الحالي.
 *  تُفعَّل الصفحة من التحكم (الإعدادات ← الميزات التفاعلية). */
export default async function DealsPage() {
  if (!(await dealsEnabled())) notFound();
  const ads = await getDealAds(60).catch(() => []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 overflow-hidden rounded-2xl p-4 text-white shadow-md" style={{ backgroundImage: 'linear-gradient(110deg,#e11d48,#be123c,#9f1239)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20"><Flame className="h-6 w-6" /></span>
          <div>
            <h1 className="text-lg font-extrabold drop-shadow">🔥 عروض اليوم</h1>
            <p className="text-xs font-medium text-white/95">تخفيضات حقيقية — السعر القديم مشطوب ونسبة الخصم ظاهرة على كل إعلان.</p>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold text-rose-700">{new Intl.NumberFormat('en-US').format(ads.length)} عرض</span>
      </div>
      {ads.length ? <AdGrid ads={ads} /> : <p className="rounded-2xl bg-secondary/30 py-12 text-center text-sm text-muted-foreground">لا توجد عروض مخفّضة حالياً — عد لاحقاً.</p>}
      <DisclaimerBar />
    </div>
  );
}
