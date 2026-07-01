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
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">إنشاء حساب جديد</h1>
        <p className="mb-5 text-sm text-muted-foreground">انضم إلى منصة تربح للأعمال.</p>
        <form action={action} className="space-y-3">
          <input name="name" placeholder="الاسم"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="phone" placeholder="رقم الجوال"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="password" type="password" placeholder="كلمة المرور (6 أحرف على الأقل)"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
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
