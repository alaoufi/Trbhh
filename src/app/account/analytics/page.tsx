import Link from 'next/link';
import Image from 'next/image';
import { Eye, Megaphone, TrendingUp, CalendarDays, ArrowRight, BarChart3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getSellerAnalytics } from '@/lib/analytics';
import { ViewsChart } from '@/components/views-chart';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تحليلات إعلاناتي' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

function Tile({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
      <Icon className="h-5 w-5 text-primary" />
      <div className="text-xl font-bold text-primary">{en(value)}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const session = await requireUser();
  const a = await getSellerAnalytics(session.uid);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary">
          <BarChart3 className="h-5 w-5" /> تحليلات إعلاناتي
        </h1>
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowRight className="h-4 w-4" /> لوحة التحكم
        </Link>
      </div>

      {a.totalAds === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-muted-foreground">
          لا توجد لديك إعلانات بعد. <Link href="/ads/new" className="font-bold text-primary hover:underline">أضِف إعلانك الأول</Link>
        </div>
      ) : (
        <>
          {/* summary tiles */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Tile icon={Megaphone} value={a.totalAds} label="إجمالي إعلاناتي" />
            <Tile icon={Megaphone} value={a.activeAds} label="إعلانات نشطة" />
            <Tile icon={Eye} value={a.totalViews} label="إجمالي المشاهدات" />
            <Tile icon={CalendarDays} value={a.views7} label="مشاهدات 7 أيام" />
            <Tile icon={TrendingUp} value={a.views30} label="مشاهدات 30 يوم" />
          </div>

          {/* daily chart */}
          <div className="card-3d rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
              <TrendingUp className="h-4 w-4" /> المشاهدات اليومية — آخر 30 يوماً
            </div>
            <ViewsChart daily={a.daily} />
          </div>

          {/* per-ad performance */}
          <div className="card-3d rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
              <BarChart3 className="h-4 w-4" /> أداء الإعلانات (الأكثر مشاهدة)
            </div>
            <div className="space-y-2">
              {a.topAds.map((ad, i) => (
                <Link key={ad.id} href={`/ads/${ad.id}`} className="flex items-center gap-3 rounded-xl border border-border/60 p-2 hover:border-primary/40">
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">{en(i + 1)}</span>
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image src={ad.image} alt={ad.title || 'إعلان'} fill sizes="48px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ad.title || `إعلان #${ad.id}`}</span>
                    <span className={`text-xs ${ad.status === 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{ad.status === 1 ? 'نشط' : 'غير نشط'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-primary">
                    <Eye className="h-4 w-4" /> {en(ad.views)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            تُحتسب المشاهدة مرة واحدة لكل زائر لكل إعلان. البيانات اليومية تُجمع منذ تفعيل التحليلات.
          </p>
        </>
      )}
    </div>
  );
}
