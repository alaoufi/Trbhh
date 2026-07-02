import { redirect } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getPromoPackages } from '@/lib/promos';
import { PromoDesigner } from '@/components/promo-designer';
import { createPromoAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أعلن معنا — المصمم الذكي' };

export default async function PromotePage({ searchParams }: { searchParams: Promise<{ error?: string; placement?: string; pkg?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const [{ error, placement, pkg }, packages] = await Promise.all([searchParams, getPromoPackages(true)]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">أعلن معنا</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        صمّم إعلانك المدفوع (صورة ثابتة أو متحركة + نص + تواصل)، اختر مكانه ومدّته، ثم أرسله للمراجعة. بعد موافقة الإدارة يُنشر في المكان المحدد.
      </p>
      {packages.length === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">لا توجد باقات إعلانية متاحة حالياً. عد لاحقاً.</div>
      )}
      <PromoDesigner action={createPromoAction} packages={packages} error={error} defaultPlacement={placement} defaultPkg={pkg} />
    </div>
  );
}
