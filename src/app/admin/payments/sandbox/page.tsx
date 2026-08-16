import { requireAction } from '@/lib/roles';
import { alrajhiConfigReport } from '@/lib/payments';
import { startAlrajhiSandboxAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, title: 'اختبار الراجحي الخاص' };

export default async function AlrajhiSandboxPage({ searchParams }: { searchParams: Promise<{ state?: string; result?: string; reason?: string }> }) {
  await requireAction('users', 'edit');
  const [report, params] = await Promise.all([Promise.resolve(alrajhiConfigReport()), searchParams]);
  const message = params.result === 'captured' ? 'نجح البنك في عملية الاختبار. لم يُضف أي رصيد.'
    : params.result ? `نتيجة البنك: ${params.result}`
      : params.state === 'notready' ? 'أكمل متغيرات Sandbox أولاً.' : params.state === 'failed' ? `رفض البنك إنشاء جلسة الاختبار${params.reason ? ` (${params.reason})` : ''}.` : '';
  return <div className="mx-auto max-w-xl space-y-4" dir="rtl">
    <h1 className="text-xl font-bold text-primary">اختبار خاص — بوابة الراجحي Sandbox</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">هذه الصفحة للإدارة فقط، غير مفهرسة، ولا تنشئ شحناً أو رصيداً أو إيراداً.</p>
    <div className="rounded-xl bg-primary/5 p-3 text-sm">الحالة: <b>{report.ready && report.environment === 'sandbox' ? 'جاهز للاختبار' : 'المتغيرات غير مكتملة أو البيئة ليست Sandbox'}</b></div>
    {message && <div className="rounded-xl border border-primary/30 bg-white p-3 font-bold">{message}</div>}
    <form action={startAlrajhiSandboxAction} className="space-y-3 rounded-2xl border bg-card p-4">
      <label className="block text-sm font-bold">مبلغ الاختبار (ر.س)<input name="amount" type="number" min="1" max="100" defaultValue="10" className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
      <button disabled={!report.ready || report.environment !== 'sandbox'} className="btn-3d rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">إنشاء صفحة اختبار البنك</button>
    </form>
  </div>;
}
