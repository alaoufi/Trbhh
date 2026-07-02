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
import { getClassifieds } from '@/lib/classified';
import { ClassifiedGrid } from '@/components/classified-card';

export const dynamic = 'force-dynamic';

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="card-3d flex flex-col items-center gap-0.5 rounded-lg p-2 text-center">
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-sm font-bold leading-tight text-primary">{new Intl.NumberFormat('ar-SA').format(value)}</div>
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function HomePage() {
  const [categories, featured, latest, mostViewed, stats, classifieds] = await Promise.all([
    getCategories(),
    getFeaturedAds(8),
    getLatestAds(12),
    getMostViewedAds(8),
    getStats(),
    getClassifieds(9).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <CategoryTabs categories={categories} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Stat icon={Megaphone} value={stats.ads} label="إعلان نشط" />
        <Stat icon={Users} value={stats.users} label="عضو مسجّل" />
        <Stat icon={Eye} value={stats.views} label="مشاهدة" />
        <Stat icon={LayoutGrid} value={stats.cats} label="قسم" />
      </div>

      {classifieds.length > 0 && (
        <Section title="الإعلانات المبوّبة" href="/classified">
          <ClassifiedGrid items={classifieds} />
        </Section>
      )}

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
