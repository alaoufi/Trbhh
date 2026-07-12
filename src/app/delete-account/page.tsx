import Link from 'next/link';
import { UserX, ShieldCheck, Trash2, LogIn, CheckCircle2 } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { SITE } from '@/lib/constants';
import { deleteMyAccountAction, requestDeletionAction } from './actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'حذف الحساب | Account Deletion',
  description: `طلب حذف الحساب والبيانات في منصة ${SITE.name} — Request account & data deletion on ${SITE.name} (Trbhh).`,
  robots: { index: true, follow: true },
};

const DELETED = [
  'الحساب وبيانات الملف الشخصي (الاسم، الجوال، البريد، الصورة)',
  'جميع إعلاناتك وصورها ومقاطعها ومشاهداتها',
  'إعلاناتك المبوّبة (بطاقات المصمم الذكي)',
  'متجرك إن وُجد (الهوية، المتابعون، التقييمات، التعاونات)',
  'محادثاتك ورسائلك كاملة',
  'تعليقاتك وتقييماتك ومفضلتك واهتماماتك',
];
const KEPT = 'تُستبقى سجلات الإشراف والبلاغات المرتبطة بمخالفات موثّقة للمتطلبات النظامية فقط، دون أي بيانات تعريفية ظاهرة.';

export default async function DeleteAccountPage({ searchParams }: { searchParams: Promise<{ done?: string; requested?: string; error?: string }> }) {
  const [{ done, requested, error }, session] = await Promise.all([searchParams, getSession().catch(() => null)]);
  const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="mx-auto max-w-xl space-y-4 py-4">
      <div className="card-3d relative overflow-hidden rounded-2xl p-6 text-white" style={{ backgroundImage: 'linear-gradient(135deg, #dc2626, #991b1b)' }}>
        <div className="relative z-10 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 backdrop-blur"><UserX className="h-7 w-7" /></span>
          <div>
            <h1 className="text-2xl font-extrabold drop-shadow">حذف الحساب</h1>
            <p className="text-sm text-white/90">Account &amp; Data Deletion — {SITE.name} (Trbhh)</p>
          </div>
        </div>
      </div>

      {done && (
        <div className="card-3d flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> تم حذف حسابك وبياناتك نهائياً. نأسف لمغادرتك، وبابنا مفتوح دائماً.
        </div>
      )}
      {requested && (
        <div className="card-3d flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> استلمنا طلبك. ستتحقق الإدارة من ملكية الرقم وتحذف الحساب خلال مدة أقصاها 30 يوماً.
        </div>
      )}
      {error === 'confirm' && <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">يجب تأكيد الإقرار قبل الحذف.</div>}
      {error === 'phone' && <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">أدخل رقم جوال صحيحاً.</div>}

      {/* ماذا يُحذف */}
      <div className="card-3d rounded-2xl p-5">
        <h2 className="mb-2 font-bold text-primary">ما الذي سيُحذف؟ / What gets deleted</h2>
        <ul className="space-y-1.5 text-sm leading-6 text-foreground/90">
          {DELETED.map((d, i) => <li key={i} className="flex gap-2"><Trash2 className="mt-1 h-3.5 w-3.5 shrink-0 text-red-600" /> {d}</li>)}
        </ul>
        <p className="mt-3 flex gap-2 rounded-xl bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {KEPT}</p>
      </div>

      {session ? (
        /* عضو مسجّل: حذف فوري */
        <form action={deleteMyAccountAction} className="card-3d space-y-3 rounded-2xl border-2 border-destructive/30 p-5">
          <h2 className="font-bold text-destructive">حذف حسابي الآن ({session.name})</h2>
          <p className="text-sm text-muted-foreground">الحذف نهائي ولا يمكن التراجع عنه.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
            <span>أُقرّ بأنني أرغب في حذف حسابي وجميع بياناتي نهائياً وأتحمل مسؤولية ذلك.</span>
          </label>
          <ConfirmSubmit msg="تأكيد أخير: حذف حسابك وجميع بياناتك نهائياً؟ لا يمكن التراجع إطلاقاً." className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold text-white hover:bg-destructive/90">
            <UserX className="h-4 w-4" /> احذف حسابي نهائياً
          </ConfirmSubmit>
        </form>
      ) : done ? null : (
        <>
          {/* غير مسجّل: الدخول للحذف الفوري */}
          <div className="card-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
            <div>
              <h2 className="font-bold text-primary">الطريقة الأسرع: سجّل دخولك</h2>
              <p className="text-sm text-muted-foreground">بعد الدخول تعود لهذه الصفحة وتحذف حسابك فوراً بنفسك.</p>
            </div>
            <Link href="/login?next=%2Fdelete-account" className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
              <LogIn className="h-4 w-4" /> تسجيل الدخول
            </Link>
          </div>

          {/* أو طلب حذف بلا دخول (تنفّذه الإدارة بعد التحقق) */}
          <form action={requestDeletionAction} className="card-3d space-y-3 rounded-2xl p-5">
            <h2 className="font-bold text-primary">لا تستطيع الدخول؟ اطلب الحذف</h2>
            <p className="text-sm text-muted-foreground">أدخل رقم الجوال المسجّل به الحساب؛ تتحقق الإدارة من ملكيته ثم تحذف الحساب خلال 30 يوماً كحد أقصى. / Can&apos;t sign in? Submit the account phone number and our team will verify ownership and delete the account within 30 days.</p>
            <input name="phone" required inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" className={field} />
            <input name="name" placeholder="الاسم (اختياري)" className={field} />
            <input name="note" placeholder="ملاحظة (اختياري)" className={field} />
            <button className="w-full rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold text-white hover:bg-destructive/90">إرسال طلب الحذف</button>
          </form>
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        راجع أيضاً <Link href="/pages/privacy" className="font-bold text-primary hover:underline">سياسة الخصوصية</Link> · <Link href="/pages/contact" className="font-bold text-primary hover:underline">تواصل معنا</Link>
      </p>
    </div>
  );
}
