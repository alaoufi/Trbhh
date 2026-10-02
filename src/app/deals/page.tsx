import { Flame } from 'lucide-react';
import { getDealAds } from '@/lib/data';
import { dealsEnabled } from '@/lib/store-extras';
import { AdGrid } from '@/components/ad-card';
import { publicPageMetadata } from '@/lib/public-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const enabled = await dealsEnabled().catch(() => false);
  return {
    ...publicPageMetadata({
      title: 'عروض اليوم',
      description: 'أقوى التخفيضات والعروض الحالية على منصة تربح.',
      path: '/deals',
    }),
    robots: enabled ? undefined : { index: false, follow: false },
  };
}

/** عروض اليوم: كل إعلان حدد معلنه «سعراً قبل الخصم» أعلى من سعره الحالي.
 *  تُفعَّل الصفحة من التحكم (الإعدادات ← الميزات التفاعلية). */
export default async function DealsPage() {
  if (!(await dealsEnabled())) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm" aria-labelledby="deals-disabled-title">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-500/10 text-rose-700"><Flame className="h-6 w-6" /></span>
        <h1 id="deals-disabled-title" className="mt-3 text-xl font-extrabold text-primary">العروض غير مفعّلة حالياً</h1>
        <p className="mt-2 text-sm text-muted-foreground">يمكنك متابعة الإعلانات المتاحة، وستظهر عروض اليوم هنا عند تفعيلها.</p>
      </section>
    );
  }
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
    </div>
  );
}
