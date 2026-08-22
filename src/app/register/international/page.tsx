'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { submitInternationalRegistrationAction } from '../actions';
import { Button } from '@/components/ui/button';

function Submit() { const { pending } = useFormStatus(); return <Button className="w-full" disabled={pending}>{pending ? 'جارٍ الإرسال…' : 'إرسال طلب التسجيل'}</Button>; }

export default function InternationalRegistrationPage() {
  const [state, action] = useFormState(submitInternationalRegistrationAction, null);
  return <div className="mx-auto max-w-md py-8"><div className="card-3d rounded-xl p-6">
    <h1 className="mb-1 text-xl font-bold">طلب تسجيل دولي</h1>
    <p className="mb-5 text-sm text-muted-foreground">لا نرسل رمز تحقق دولياً حالياً. سيراجع الفريق طلبك قبل إنشاء أي حساب.</p>
    {state?.notice ? <div className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{state.notice}</div> : <form action={action} className="space-y-3">
      <input name="country" required placeholder="الدولة" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <input name="name" required placeholder="الاسم" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <input name="phone" required inputMode="tel" dir="ltr" placeholder="رقم الجوال الدولي" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <input name="email" required type="email" dir="ltr" placeholder="البريد الإلكتروني" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <textarea name="reason" required maxLength={500} rows={3} placeholder="عرّف بنفسك وسبب التسجيل" className="w-full rounded-lg border bg-background p-3 text-sm" />
      <input name="password" required type="password" minLength={4} placeholder="كلمة المرور (4 خانات على الأقل)" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <label className="flex gap-2 text-sm"><input type="checkbox" name="agree" required /> أوافق على الشروط والأحكام وسياسة الخصوصية.</label>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Submit />
    </form>}
    <Link href="/register" className="mt-4 block text-center text-sm text-primary hover:underline">لدي رقم سعودي</Link>
  </div></div>;
}
