import Link from 'next/link';
import { Users, Megaphone, LayoutGrid, Eye, Sparkles, ChevronLeft } from 'lucide-react';
import {
  getCategories,
  getFeaturedAds,
  getLatestAds,
  getMostViewedAds,
  getStats,
} from '@/lib/data';
import { CategoryTabs } from '@/components/category-tabs';
import { AdGrid } from '@/components/ad-card';
import { Section } from '@/components/section';
import { PromoSlot } from '@/components/promo-slot';
import { DisclaimerBar } from '@/components/disclaimer';
import { getHomeStats } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function Stat({ icon: Icon, value, label, href }: { icon: React.ElementType; value: number; label: string; href?: string }) {
  const inner = (
    <>
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-sm font-bold leading-tight text-primary">{new Intl.NumberFormat('en-US').format(value)}</div>
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
    </>
  );
  const cls = 'card-3d flex flex-col items-center gap-0.5 rounded-lg p-2 text-center';
  return href ? (
    <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:border-primary/40`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function HomePage() {
  const [categories, featured, latest, mostViewed, stats, homeStats] = await Promise.all([
    getCategories(),
    getFeaturedAds(8),
    getLatestAds(12),
    getMostViewedAds(8),
    getStats(),
    getHomeStats().catch(() => new Set(['ads', 'users', 'views', 'cats'])),
  ]);
  const statCards: { key: string; icon: React.ElementType; value: number; label: string; href?: string }[] = [
    { key: 'ads', icon: Megaphone, value: stats.ads, label: 'إعلان نشط', href: '/search' },
    { key: 'users', icon: Users, value: stats.users, label: 'عضو مسجّل' },
    { key: 'views', icon: Eye, value: stats.views, label: 'مشاهدة' },
    { key: 'cats', icon: LayoutGrid, value: stats.cats, label: 'قسم', href: '/search' },
  ].filter((s) => homeStats.has(s.key));

  return (
    <div className="space-y-4">
      {/* Paid banner — top of home */}
      <PromoSlot placement="home_top" />

      {/* Category tabs */}
      <CategoryTabs categories={categories} />

      {/* Stats — the admin selects which cards to show */}
      {statCards.length > 0 && (
        <div className={`grid gap-2 ${['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][statCards.length] || 'grid-cols-4'}`}>
          {statCards.map((s) => <Stat key={s.key} icon={s.icon} value={s.value} label={s.label} href={s.href} />)}
        </div>
      )}

      {/* Classified ads entry link */}
      <Link href="/classified" className="card-3d flex items-center justify-between gap-3 rounded-2xl p-4">
        <span className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-6 w-6" /></span>
          <span>
            <span className="block font-bold text-primary">الإعلانات المبوّبة</span>
            <span className="block text-xs text-muted-foreground">تصفّح البطاقات أو صمّم إعلانك بالمصمم الذكي</span>
          </span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
      </Link>

      {featured.length > 0 && (
        <Section title="إعلانات مميّزة" href="/search?special=1">
          <AdGrid ads={featured} />
        </Section>
      )}

      <Section title="أحدث الإعلانات" href="/search">
        <div className="space-y-4">
          <AdGrid ads={latest.slice(0, 4)} />
          {/* Paid banner — in-feed after 4 ads */}
          <PromoSlot placement="feed" />
          {latest.length > 4 && <AdGrid ads={latest.slice(4)} />}
        </div>
      </Section>

      {mostViewed.length > 0 && (
        <Section title="الأكثر مشاهدة">
          <AdGrid ads={mostViewed} />
        </Section>
      )}

      <DisclaimerBar />
    </div>
  );
}
