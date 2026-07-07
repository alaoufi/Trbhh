import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { ClassifiedForm } from '@/components/classified-form';
import { createClassifiedAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المصمم الذكي — إعلان مبوّب' };

export default async function NewClassifiedPage({ searchParams }: { searchParams: Promise<{ error?: string; price?: string; bal?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, price, bal } = await searchParams;
  const { getServicePricing, serviceHasPrice } = await import('@/lib/settings');
  const cp = (await getServicePricing()).classified;
  const durations = serviceHasPrice(cp) ? cp : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">المصمم الذكي</h1>
      </div>
      <p className="text-sm text-muted-foreground">اكتب المحتوى، والمصمم الذكي يحوّله إلى بطاقة مربّعة ثلاثية الأبعاد أنيقة تُنشر مباشرة.</p>
      <ClassifiedForm action={createClassifiedAction} error={error} needPrice={price} needBal={bal} durations={durations} />
    </div>
  );
}
