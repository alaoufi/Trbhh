import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { ClassifiedForm } from '@/components/classified-form';
import { createClassifiedAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المصمم الذكي — إعلان مبوّب' };

export default async function NewClassifiedPage({ searchParams }: { searchParams: Promise<{ error?: string; price?: string; bal?: string; wait?: string; left?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, price, bal, wait, left } = await searchParams;
  const { getServicePricing, serviceHasPrice, DURATIONS } = await import('@/lib/settings');
  const { getBalance } = await import('@/lib/wallet');
  const { getSettingBool, getScheduleMaxDays } = await import('@/lib/settings');
  const [cp, balance, allowSchedule, scheduleMaxDays] = await Promise.all([getServicePricing().then((p) => p.classified), getBalance(session.uid), getSettingBool('schedule_on', false).catch(() => false), getScheduleMaxDays().catch(() => 30)]);
  const paid = serviceHasPrice(cp);
  const durations = paid ? cp : null;
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">المصمم الذكي</h1>
      </div>
      <p className="text-sm text-muted-foreground">اكتب المحتوى، والمصمم الذكي يحوّله إلى بطاقة مربّعة ثلاثية الأبعاد أنيقة تُنشر مباشرة.</p>

      {/* تنبيه مسبق بالتسعير والحسم من الرصيد — قبل البدء بالتصميم */}
      {paid && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm">
          <div className="mb-1 font-extrabold text-amber-800">💳 نشر الإعلان المبوّب مدفوع</div>
          <p className="text-amber-900">سيُخصم من رصيدك عند النشر حسب المدّة التي تختارها:</p>
          <ul className="mt-1 grid grid-cols-3 gap-2 text-center">
            {DURATIONS.filter((d) => cp[d.key] > 0).map((d) => (
              <li key={d.key} className="rounded-lg border border-amber-300 bg-white p-2">
                <div className="text-[11px] font-bold text-muted-foreground">{d.label}</div>
                <div className="font-extrabold text-amber-700">{en(cp[d.key])} ر.س</div>
              </li>
            ))}
          </ul>
          <div className="mt-2 font-bold text-amber-900">رصيدك الحالي: <b>{en(balance)} ر.س</b>{' '}
            <a href="/account/wallet" className="underline">محفظتي</a>
          </div>
        </div>
      )}

      <ClassifiedForm action={createClassifiedAction} error={error} needPrice={price} needBal={bal} gapWait={wait} dupLeft={left} durations={durations} balance={paid ? balance : undefined} allowSchedule={allowSchedule} scheduleMaxDays={scheduleMaxDays} />
    </div>
  );
}
