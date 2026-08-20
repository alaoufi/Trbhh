import { requireAction } from '@/lib/roles';
import { alrajhiConfigReport, getPaymentConfig } from '@/lib/payments';
import { startAlrajhiPrivateTopupAction } from '../../actions';
import { PrivateAlrajhiTopupForm } from './private-topup-form';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, title: 'شحن خاص بالراجحي' };

export default async function PrivateAlrajhiTopupPage({ searchParams }: { searchParams: Promise<{ state?: string; reason?: string; min?: string; max?: string }> }) {
  await requireAction('users', 'edit');
  const [report, cfg, params] = await Promise.all([Promise.resolve(alrajhiConfigReport()), getPaymentConfig(), searchParams]);
  const ready = report.ready && report.environment === 'production';
  const message = params.state === 'notready' ? 'بيئة الإنتاج أو حقول الراجحي غير مكتملة؛ لا يمكن إنشاء جلسة دفع.'
    : params.state === 'amount' ? `أدخل مبلغاً بين ${params.min || cfg.min} و${params.max || cfg.max} ر.س.`
      : params.state === 'failed' ? `لم تُنشأ جلسة دفع ولم يُضف أي رصيد${params.reason ? ` (${params.reason})` : ''}.`
        : '';

  return <main className="mx-auto max-w-xl space-y-4" dir="rtl">
    <h1 className="text-xl font-extrabold text-primary">شحن رصيد خاص — مصرف الراجحي</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">هذه الصفحة للإدارة فقط وغير مفهرسة ولا تظهر للأعضاء. الشحن لا يُضاف إلا بعد تأكيد البنك من الخادم.</p>
    <div className="rounded-xl bg-primary/5 p-3 text-sm">حالة الربط: <b>{ready ? 'جاهز لتجربة إنتاج خاصة' : 'غير مكتمل أو ليس في بيئة الإنتاج'}</b></div>
    {message && <div className="rounded-xl border border-primary/30 bg-white p-3 text-sm font-bold">{message}</div>}
    <PrivateAlrajhiTopupForm action={startAlrajhiPrivateTopupAction} min={cfg.min} max={cfg.max} ready={ready} />
  </main>;
}
