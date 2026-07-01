'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction } from './actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return <Button className="w-full" disabled={pending}>{pending ? '...' : 'دخول'}</Button>;
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card-3d rounded-xl p-6">
        <h1 className="mb-1 text-xl font-bold">تسجيل الدخول</h1>
        <p className="mb-5 text-sm text-muted-foreground">ادخل بنفس بياناتك المسجّلة سابقاً.</p>
        <form action={action} className="space-y-3">
          <input name="identifier" placeholder="الجوال أو اسم المستخدم أو البريد"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="password" type="password" placeholder="كلمة المرور"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Submit />
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟ <Link href="/register" className="text-primary hover:underline">أنشئ حساباً</Link>
        </p>
      </div>
    </div>
  );
}
