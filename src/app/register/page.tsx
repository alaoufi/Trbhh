'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { confirmSaudiRegistrationAction, startRegistrationAction } from './actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return <Button className="w-full" disabled={pending}>{pending ? '...' : 'إنشاء حساب'}</Button>;
}

export default function RegisterPage() {
  const [state, action] = useFormState(startRegistrationAction, null);
  const [otpState, otpAction] = useFormState(confirmSaudiRegistrationAction, null);
  const active = otpState || state;
  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card-3d rounded-xl p-6">
        <h1 className="mb-1 text-xl font-bold">إنشاء حساب جديد</h1>
        <p className="mb-5 text-sm text-muted-foreground">انضم إلى منصة تربح للأعمال.</p>
        {active?.step === 'otp' ? <form action={otpAction} className="space-y-3">
          <p className="rounded-lg bg-primary/10 p-3 text-sm font-bold text-primary">{active.notice || 'أدخل رمز التحقق المرسل إلى جوالك.'}</p>
          <input type="hidden" name="phone" value={active.phone || ''} />
          <input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code" placeholder="رمز التحقق" className="h-11 w-full rounded-lg border bg-background px-3 text-center text-lg tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring" dir="ltr" />
          {active.error && <p className="text-sm text-destructive">{active.error}</p>}
          <Submit />
        </form> : <form action={action} className="space-y-3">
          <input name="name" placeholder="الاسم"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="phone" placeholder="05xxxxxxxx"
            inputMode="tel" dir="ltr"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="password" type="password" minLength={4} placeholder="كلمة المرور (4 خانات على الأقل)"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <label className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span className="text-foreground/90">
              أوافق على{' '}
              <Link href="/pages/terms" target="_blank" className="font-bold text-primary hover:underline">الشروط والأحكام</Link>
              {' '}و{' '}
              <Link href="/pages/privacy" target="_blank" className="font-bold text-primary hover:underline">سياسة الخصوصية</Link>.
            </span>
          </label>
          <p className="text-xs text-muted-foreground">التسجيل الإلكتروني للأرقام السعودية فقط ويتم بعد رمز تحقق OTP.</p>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Submit />
        </form>}
        <Link href="/register/international" className="mt-3 block text-center text-sm font-bold text-primary hover:underline">رقمي من خارج المملكة — طلب تسجيل دولي</Link>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          لديك حساب؟ <Link href="/login" className="text-primary hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
