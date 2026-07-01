import { Users, Megaphone, LayoutGrid, Eye } from 'lucide-react';
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
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="card-3d flex items-center gap-3 rounded-xl p-3">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-lg font-bold text-primary">{new Intl.NumberFormat('ar-SA').format(value)}</div>
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
      {/* Category tabs */}
      <CategoryTabs categories={categories} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Megaphone} value={stats.ads} label="إعلان نشط" />
        <Stat icon={Users} value={stats.users} label="عضو مسجّل" />
        <Stat icon={Eye} value={stats.views} label="مشاهدة" />
        <Stat icon={LayoutGrid} value={stats.cats} label="قسم" />
      </div>

      {featured.length > 0 && (
        <Section title="إعلانات مميّزة" href="/search?special=1">
          <AdGrid ads={featured} />
        </Section>
      )}

      <Section title="أحدث الإعلانات" href="/search">
        <AdGrid ads={latest} />
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
