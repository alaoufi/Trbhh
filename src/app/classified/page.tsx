import Link from 'next/link';
import { Sparkles, Plus, Check } from 'lucide-react';
import { getClassifieds } from '@/lib/classified';
import { getEmptyText } from '@/lib/settings';
import { ClassifiedGrid } from '@/components/classified-card';
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعلانات المبوّبة' };

export default async function ClassifiedPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const [items, sp] = await Promise.all([getClassifieds(60), searchParams]);
  const emptyClassified = await getEmptyText('classified').catch(() => 'لا توجد إعلانات مبوّبة بعد.');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">الإعلانات المبوّبة</h1>
        </div>
        <Link href="/classified/new" className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> أضف إعلان مبوّب
        </Link>
      </div>

      {sp.created === '1' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Check className="h-4 w-4" /> تم تصميم إعلانك ونشره بنجاح.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">{emptyClassified}</p>
          <Link href="/classified/new" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">صمّم أول إعلان</Link>
        </div>
      ) : (
        <ClassifiedGrid items={items} />
      )}

      <DisclaimerBar />
    </div>
  );
}
