import Link from 'next/link';
import { Search, Users, Megaphone, LayoutGrid, Eye } from 'lucide-react';
import {
  getCategories,
  getFeaturedAds,
  getLatestAds,
  getMostViewedAds,
  getStats,
} from '@/lib/data';
import { CategoryGrid } from '@/components/category-grid';
import { AdGrid } from '@/components/ad-card';
import { Section } from '@/components/section';
import { DisclaimerBar } from '@/components/disclaimer';

export const revalidate = 120;

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-lg font-bold">{new Intl.NumberFormat('ar-SA').format(value)}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [categories, featured, latest, mostViewed, stats] = await Promise.all([
    getCategories(),
    getFeaturedAds(8),
    getLatestAds(12),
    getMostViewedAds(8),
    getStats(),
  ]);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-l from-primary to-emerald-600 p-6 text-primary-foreground md:p-10">
        <h1 className="text-2xl font-bold md:text-3xl">منصة الإعلانات المبوبة والأعمال التجارية</h1>
        <p className="mt-2 max-w-2xl text-sm text-primary-foreground/90 md:text-base">
          اعرض خدماتك ومعداتك وتواصل مباشرة مع الشركات والموردين والعملاء في بيئة موثوقة.
        </p>
        <form action="/search" className="relative mt-5 max-w-xl">
          <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            placeholder="ابحث عن خدمة، معدة، مورد، أو شركة..."
            className="h-12 w-full rounded-xl border-0 bg-white pr-11 pl-4 text-foreground outline-none focus:ring-2 focus:ring-white/50"
          />
        </form>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Megaphone} value={stats.ads} label="إعلان نشط" />
        <Stat icon={Users} value={stats.users} label="عضو مسجّل" />
        <Stat icon={LayoutGrid} value={stats.cats} label="قسم" />
        <Stat icon={Eye} value={stats.views} label="مشاهدة" />
      </div>

      {/* Categories */}
      <Section title="تصفّح الأقسام" href="/categories">
        <CategoryGrid categories={categories} />
      </Section>

      {/* Featured */}
      {featured.length > 0 && (
        <Section title="إعلانات مميّزة" href="/search?special=1">
          <AdGrid ads={featured} />
        </Section>
      )}

      {/* Latest */}
      <Section title="أحدث الإعلانات" href="/search">
        <AdGrid ads={latest} />
      </Section>

      {/* Most viewed */}
      {mostViewed.length > 0 && (
        <Section title="الأكثر مشاهدة">
          <AdGrid ads={mostViewed} />
        </Section>
      )}

      <DisclaimerBar />
    </div>
  );
}
