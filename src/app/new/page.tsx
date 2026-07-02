import { getCategories, getLatestAds } from '@/lib/data';
import { CategoryTabs } from '@/components/category-tabs';
import { AdGrid } from '@/components/ad-card';
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أحدث الإعلانات' };

export default async function NewAdsPage() {
  const [categories, ads] = await Promise.all([getCategories(), getLatestAds(60)]);
  return (
    <div className="space-y-4">
      <CategoryTabs categories={categories} newActive />
      <h1 className="text-lg font-bold text-primary">أحدث الإعلانات</h1>
      <AdGrid ads={ads} />
      <DisclaimerBar />
    </div>
  );
}
