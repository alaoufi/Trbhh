import { notFound } from 'next/navigation';
import { getCategory, getAdsByCategory } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCategory(Number(id));
  return { title: cat?.name ?? 'القسم' };
}

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCategory(Number(id));
  if (!cat) notFound();
  const ads = await getAdsByCategory(cat.id, 48);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{cat.name}</h1>
        <span className="text-sm text-muted-foreground">{ads.length} إعلان</span>
      </div>
      <AdGrid ads={ads} />
    </div>
  );
}
