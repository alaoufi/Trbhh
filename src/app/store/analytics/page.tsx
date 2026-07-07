import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Eye, Megaphone, TrendingUp, CalendarDays, ArrowRight, BarChart3, Users, UserCheck, Store } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getSellerAnalytics } from '@/lib/analytics';
import { getStoreVisitorStats } from '@/lib/store-analytics';
import { followersCount } from '@/lib/merchant';
import { ViewsChart } from '@/components/views-chart';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إحصائيات المتجر' };

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

export default async function StoreAnalyticsPage() {
  const session = await requireUser();
  const store = await getStoreByUser(session.uid);
  if (!store) redirect('/store');
  const [visitors, ads, followers] = await Promise.all([
    getStoreVisitorStats(store.id),
    getSellerAnalytics(session.uid),
    followersCount(store.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><BarChart3 className="h-5 w-5" /> إحصائيات المتجر</h1>
        <Link href="/store" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /> لوحة المتجر</Link>
      </div>

      {/* زوار المتجر */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><Store className="h-4 w-4" /> زوّار المتجر</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Tile icon={Users} value={visitors.uniqueVisitors} label="زوّار مختلفون" />
          <Tile icon={Eye} value={visitors.totalVisits} label="إجمالي الزيارات" />
          <Tile icon={CalendarDays} value={visitors.visits7} label="زيارات 7 أيام" />
          <Tile icon={TrendingUp} value={visitors.visits30} label="زيارات 30 يوم" />
          <Tile icon={UserCheck} value={followers} label="المتابعون" />
        </div>
        <div className="card-3d rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><TrendingUp className="h-4 w-4" /> الزيارات اليومية — آخر 30 يوماً</div>
          <ViewsChart daily={visitors.daily.map((p) => ({ date: p.date, views: p.visits }))} />
        </div>
      </section>

      {/* مشاهدات الإعلانات */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><Eye className="h-4 w-4" /> مشاهدات الإعلانات</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Tile icon={Megaphone} value={ads.totalAds} label="إجمالي الإعلانات" />
          <Tile icon={Megaphone} value={ads.activeAds} label="إعلانات نشطة" />
          <Tile icon={Eye} value={ads.totalViews} label="إجمالي المشاهدات" />
          <Tile icon={CalendarDays} value={ads.views7} label="مشاهدات 7 أيام" />
          <Tile icon={TrendingUp} value={ads.views30} label="مشاهدات 30 يوم" />
        </div>
        <div className="card-3d rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><TrendingUp className="h-4 w-4" /> المشاهدات اليومية — آخر 30 يوماً</div>
          <ViewsChart daily={ads.daily} />
        </div>
      </section>

      {/* تحليل الإعلانات — الأداء لكل إعلان */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><BarChart3 className="h-4 w-4" /> تحليل الإعلانات (الأكثر مشاهدة)</div>
        {ads.topAds.length === 0 ? (
          <div className="card-3d rounded-2xl p-8 text-center text-muted-foreground">لا توجد إعلانات بعد.</div>
        ) : (
          <div className="card-3d rounded-2xl p-4">
            <div className="space-y-2">
              {ads.topAds.map((ad, i) => (
                <Link key={ad.id} href={`/ads/${ad.id}`} className="flex items-center gap-3 rounded-xl border border-border/60 p-2 hover:border-primary/40">
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">{en(i + 1)}</span>
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image src={ad.image} alt={ad.title || 'إعلان'} fill sizes="48px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ad.title || `إعلان #${ad.id}`}</span>
                    <span className={`text-xs ${ad.status === 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{ad.status === 1 ? 'نشط' : 'غير نشط'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-primary"><Eye className="h-4 w-4" /> {en(ad.views)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-center text-[11px] text-muted-foreground">تُحتسب زيارة المتجر ومشاهدة الإعلان مرة واحدة لكل زائر يومياً. لا تُحتسب زياراتك لمتجرك.</p>
    </div>
  );
}
