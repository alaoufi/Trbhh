import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { accountVerifyState } from '@/lib/account-verify';
import { BadgeCheck, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { submitVerificationAction, renewAccountVerificationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'توثيق الحساب' };

const fmtDay = (iso: string) => new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(iso));

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ renewed?: string; err?: string }> }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const vst = user ? await accountVerifyState(Number(user.id)).catch(() => null) : null;
  const field = 'w-full rounded-lg border bg-background p-2 text-sm';

  // موثّق حالياً (وغير منتهٍ) — مع بيان مدة الصلاحية والتجديد التلقائي إن فُعّلت المدة
  if (vst?.verified) {
    return (
      <div className="max-w-lg space-y-3">
        {sp.renewed === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm font-bold text-emerald-800">✓ تم تجديد توثيق حسابك وخُصمت الرسوم من رصيدك — الشارة فعّالة الآن.</div>}
        <div className="rounded-xl border border-primary/30 bg-accent p-8 text-center">
          <BadgeCheck className="mx-auto mb-2 h-10 w-10 text-primary" />
          <h1 className="text-lg font-bold">حسابك موثّق ✓</h1>
          <p className="text-sm text-accent-foreground">تتمتع بعلامة موثّق وأولوية بالظهور وإحصائيات متقدمة.</p>
          {!vst.permanent && !vst.storeBased && vst.expiresAt && (
            <p className="mt-2 text-xs font-bold text-muted-foreground">
              صالح حتى {fmtDay(vst.expiresAt)}{vst.fee > 0 ? ` — يُجدَّد تلقائياً بخصم ${vst.fee} ر.س من رصيدك عند الانتهاء دون موافقة.` : '.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  const pending = (user?.step ?? 0) > 0;
  const rejected = (user?.step ?? 0) === 2 && !!user?.verify_note;

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">توثيق الحساب</h1></div>

      {sp.err === 'balance' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي لتجديد التوثيق — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك</Link> ثم أعد المحاولة.</div>}

      {/* انتهت مدة توثيق سابق → تجديد فوري بالخصم بلا موافقة (محجوب عند نقص الرصيد) */}
      {vst?.lapsed && vst.canRenew && (
        <div className="space-y-2 rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-sky-800"><Clock className="h-4 w-4" /> انتهت مدة توثيق حسابك</div>
          <p className="text-xs text-muted-foreground">التجديد <b>فوري</b> بخصم {vst.fee} ر.س من رصيدك ويُفعّل مباشرة بلا انتظار موافقة (رصيدك: {vst.balance} ر.س).</p>
          {vst.balance >= vst.fee ? (
            <form action={renewAccountVerificationAction}>
              <ConfirmSubmit msg={`تجديد توثيق حسابك؟ سيُخصم ${vst.fee} ر.س من رصيدك فوراً ويُفعّل التوثيق مباشرة.`} className="btn-3d rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">⭐ جدّد توثيق حسابك الآن ({vst.fee} ر.س)</ConfirmSubmit>
            </form>
          ) : (
            <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs font-bold text-red-700">💳 رصيدك ({vst.balance} ر.س) لا يكفي لرسوم التجديد ({vst.fee} ر.س) — <Link href="/account/wallet#topup" className="underline">اشحن رصيدك</Link></div>
          )}
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Clock className="h-4 w-4" /> طلب التوثيق قيد المراجعة من الإدارة.
        </div>
      )}
      {rejected && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">❌ رُفض طلبك السابق: {user!.verify_note} — يمكنك رفع وثائق صحيحة والطلب مجدداً.</div>}

      {/* أول توثيق دائماً بمراجعة الإدارة (بالمستندات) — لا يُدفع مقابله */}
      {!vst?.lapsed && (
        <>
          <p className="text-sm text-muted-foreground">ارفع وثائقك الرسمية ليقوم فريق الإدارة بمراجعتها ومنحك علامة التوثيق (أول توثيق بموافقة الإدارة).</p>
          <form action={submitVerificationAction} className="space-y-4 card-3d rounded-xl p-5">
            <div><label className="mb-1 block text-sm font-medium">الهوية الوطنية</label><input name="national_identity" type="file" accept="image/*,application/pdf" className={field} /></div>
            <div><label className="mb-1 block text-sm font-medium">السجل التجاري (للشركات)</label><input name="commercial_register" type="file" accept="image/*,application/pdf" className={field} /></div>
            <div><label className="mb-1 block text-sm font-medium">تصريح العمل (اختياري)</label><input name="work_permit" type="file" accept="image/*,application/pdf" className={field} /></div>
            <Button>إرسال طلب التوثيق</Button>
          </form>
        </>
      )}
    </div>
  );
}
