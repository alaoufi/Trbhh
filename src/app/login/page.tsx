'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction } from './actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return <Button className="w-full" disabled={pending}>{pending ? '...' : 'دخول'}</Button>;
}

function LoginInner() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  const sp = useSearchParams();
  const reset = sp.get('reset');
  const next = sp.get('next') || '';
  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card-3d rounded-xl p-6">
        {/* مبدّل واضح: الدخول على تربح أو على المتجر */}
        <div className="mb-4">
          <div className="mb-1.5 text-center text-xs font-bold text-muted-foreground">الدخول على</div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/50 p-1 text-sm font-bold">
            <span className="rounded-lg bg-primary py-2 text-center text-white shadow">تربح</span>
            <Link href="/store-login" className="rounded-lg py-2 text-center text-muted-foreground transition hover:bg-white/70">المتجر</Link>
          </div>
        </div>
        <h1 className="mb-1 text-xl font-bold">الدخول على تربح</h1>
        <p className="mb-5 text-sm text-muted-foreground">دخول عضو منصّة تربح بنفس بياناتك المسجّلة سابقاً.</p>
        {reset && <p className="mb-3 rounded-lg border border-green-300 bg-green-50 p-2 text-sm font-bold text-green-800">تم تغيير كلمة المرور بنجاح، سجّل الدخول بها الآن.</p>}
        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="identifier" placeholder="الجوال أو اسم المستخدم أو البريد"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="password" type="password" placeholder="كلمة المرور"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Submit />
        </form>
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot" className="font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>
        </p>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟ <Link href="/register" className="text-primary hover:underline">أنشئ حساباً</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm py-8" />}>
      <LoginInner />
    </Suspense>
  );
}
