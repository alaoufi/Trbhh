'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { registerAction } from '../login/actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return <Button className="w-full" disabled={pending}>{pending ? '...' : 'إنشاء حساب'}</Button>;
}

export default function RegisterPage() {
  const [state, action] = useFormState(registerAction, null as { error?: string } | null);
  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card-3d rounded-xl p-6">
        <h1 className="mb-1 text-xl font-bold">إنشاء حساب جديد</h1>
        <p className="mb-5 text-sm text-muted-foreground">انضم إلى منصة تربح للأعمال.</p>
        <form action={action} className="space-y-3">
          <input name="name" placeholder="الاسم"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="phone" placeholder="رقم الجوال"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="password" type="password" placeholder="كلمة المرور (6 أحرف على الأقل)"
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
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Submit />
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          لديك حساب؟ <Link href="/login" className="text-primary hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
