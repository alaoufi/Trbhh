import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getBalance, getTopupById } from '@/lib/wallet';
import { confirmTopupById } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'نتيجة الدفع' };

export default async function PaymentResultPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const session = await requireUser();
  const { t } = await searchParams;
  const topupId = Number(t || 0);
  if (Number.isSafeInteger(topupId) && topupId > 0) await confirmTopupById(topupId).catch(() => {});
  const topup = Number.isSafeInteger(topupId) && topupId > 0 ? await getTopupById(topupId) : null;
  if (!topup || topup.userIdNum !== session.uid || topup.source !== 'online') {
    return <section className="mx-auto max-w-lg space-y-4 rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-center"><XCircle className="mx-auto h-12 w-12 text-red-600" /><h1 className="text-xl font-extrabold text-red-900">تعذر العثور على عملية الدفع</h1><p className="text-sm text-red-800">لم يتغير رصيدك. يمكنك مراجعة سجل الشحن أو المحاولة مرة أخرى.</p><Link href="/account/wallet?tab=topups" className="btn-3d inline-block rounded-xl bg-primary px-5 py-3 font-bold text-white">العودة إلى محفظتي</Link></section>;
  }

  // بطاقة الدفع لا تدخل أي مسار موافقة في تربح. بعد محاولة الاستعلام
  // الموثوقة من البنك، أي نتيجة لم تعتمد الرصيد تُعرض للعضو كعملية غير
  // مكتملة ولا تُنشئ حالة ثالثة عائمة باسم «قيد التحقق».
  const success = topup.status === 1;
  const failed = !success;
  const balance = success ? await getBalance(session.uid) : null;
  const Icon = success ? CheckCircle2 : XCircle;
  const title = success ? 'تم شحن الرصيد بنجاح' : 'تم رفض شحن الرصيد';
  const text = success
    ? `تم شحن الرصيد بنجاح بمبلغ ${topup.amount} ر.س وأُضيف إلى رصيدك تلقائياً.`
    : (topup.note || 'تم رفض شحن الرصيد من البنك. لم يُضف أي مبلغ إلى رصيدك.');
  const color = success ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900';

  return <section className={`mx-auto max-w-lg space-y-5 rounded-2xl border-2 p-6 text-center ${color}`}><Icon className="mx-auto h-14 w-14" /><div><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-2 text-sm font-medium leading-6">{text}</p></div><dl className="grid grid-cols-2 gap-2 rounded-xl bg-white/80 p-4 text-right text-sm"><div><dt className="text-muted-foreground">رقم العملية</dt><dd className="font-extrabold">#{topup.id}</dd></div><div><dt className="text-muted-foreground">المبلغ</dt><dd className="font-extrabold">{topup.amount} ر.س</dd></div><div><dt className="text-muted-foreground">طريقة الدفع</dt><dd className="font-extrabold">{topup.method || 'بوابة إلكترونية'}</dd></div>{success && <div><dt className="text-muted-foreground">الرصيد الحالي</dt><dd className="font-extrabold">{balance} ر.س</dd></div>}</dl><div className="flex flex-wrap justify-center gap-2">{success ? <Link href="/account/wallet?tab=topups" className="btn-3d rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">محفظتي</Link> : <><Link href="/account/wallet?tab=topups#paynow" className="btn-3d rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">تجربة بطاقة أخرى</Link><Link href="/account/wallet?tab=topups#topup" className="rounded-xl border-2 border-current px-5 py-3 text-sm font-bold">التحويل البنكي</Link><Link href="/" className="rounded-xl border-2 border-current px-5 py-3 text-sm font-bold">الصفحة الرئيسية</Link></>}</div></section>;
}
