'use client';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Store, KeyRound, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendStoreOtpAction, verifyStoreOtpAction, type ForgotState } from './actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button className="w-full" disabled={pending}>{pending ? '...' : label}</Button>;
}

const field = 'h-12 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40';

export default function StoreForgotPage() {
  const [state, action] = useFormState<ForgotState, FormData>(
    async (prev, fd) => (prev.step === 'code' ? verifyStoreOtpAction(prev, fd) : sendStoreOtpAction(prev, fd)),
    { step: 'phone' },
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-white"><Store className="h-8 w-8" /></span>
      <h1 className="text-xl font-extrabold text-primary">استعادة دخول المتجر</h1>

      {state.step === 'done' ? (
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><Check className="h-4 w-4" /> تم التحقق. هذه بيانات دخول متجرك:</div>
          <div className="space-y-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-muted-foreground">اسم دخول المتجر</span><b className="text-primary" dir="ltr">{state.username}</b></div>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-muted-foreground">كلمة المرور الجديدة</span><b className="text-primary" dir="ltr">{state.password}</b></div>
          </div>
          <p className="text-xs text-muted-foreground">احفظها في مكان آمن. يمكنك تغييرها لاحقاً من «متجري ← دخول مستقل للمتجر».</p>
          <Link href="/store-login" className="block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-bold text-white">الذهاب لتسجيل الدخول</Link>
        </div>
      ) : (
        <form action={action} className="w-full space-y-3">
          {state.step === 'code' ? (
            <>
              <input type="hidden" name="phone" value={state.phone} />
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs font-bold text-primary"><ShieldCheck className="h-4 w-4 shrink-0" /> أرسلنا رمزاً إلى {state.phone}.</div>
              {state.note && <p className="text-xs text-amber-700">{state.note}</p>}
              <input name="code" inputMode="numeric" maxLength={4} required placeholder="####" className={`${field} tracking-[0.5em] text-center`} />
              {state.error && <p className="text-sm font-bold text-destructive">{state.error}</p>}
              <Submit label="تأكيد الرمز" />
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">أدخل رقم جوالك المسجّل في تربح، نرسل لك رمزاً، ثم نعرض معرّف متجرك ونعيّن كلمة مرور جديدة.</p>
              <input name="phone" inputMode="tel" required placeholder="05xxxxxxxx" className={`${field} text-center`} dir="ltr" />
              {state.error && <p className="text-sm font-bold text-destructive">{state.error}</p>}
              <Submit label="إرسال رمز التحقق" />
            </>
          )}
        </form>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Link href="/store-login" className="flex items-center gap-1 font-bold text-primary"><KeyRound className="h-3.5 w-3.5" /> دخول المتاجر</Link>
        <Link href="/login" className="font-bold text-primary">دخول تربح</Link>
      </div>
    </div>
  );
}
