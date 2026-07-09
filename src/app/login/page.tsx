'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { LogIn, Home } from 'lucide-react';
import { loginAction } from './actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return <Button className="btn-3d w-full gap-2" disabled={pending}><LogIn className="h-4 w-4" /> {pending ? '...' : 'دخول'}</Button>;
}

const fieldCls = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function LoginInner() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  const sp = useSearchParams();
  const reset = sp.get('reset');
  const next = sp.get('next') || '';

  return (
    <div className="mx-auto max-w-sm px-4 py-6">
      {/* رجوع للموقع فقط — بلا هيدر أو قائمة سفلية */}
      <div className="mb-4">
        <Link href="/" className="btn-3d inline-flex items-center gap-1.5 rounded-full bg-gradient-to-l from-primary to-primary/80 px-4 py-2 text-sm font-bold text-white">
          <Home className="h-4 w-4" /> الرجوع للموقع
        </Link>
      </div>

      <div className="card-3d rounded-xl p-6">
        <h1 className="mb-1 text-xl font-bold">تسجيل الدخول</h1>
        <p className="mb-5 text-sm text-muted-foreground">بيانات دخول موحّدة لتربح ومتجرك: رقم الجوال وكلمة المرور.</p>
        {reset && <p className="mb-3 rounded-lg border border-green-300 bg-green-50 p-2 text-sm font-bold text-green-800">تم تغيير كلمة المرور بنجاح، سجّل الدخول بها الآن.</p>}
        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="identifier" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="رقم الجوال (05xxxxxxxx)" className={`${fieldCls} text-left`} />
          <input name="password" type="password" autoComplete="current-password" placeholder="كلمة المرور" className={fieldCls} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Submit />
        </form>
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot" className="font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>
        </p>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟ <Link href="/register" className="text-primary hover:underline">أنشئ حساباً</Link>
        </p>
        {/* بيانات موحّدة: نفس الدخول يفتح إدارة متجرك تلقائياً */}
        <p className="mt-4 rounded-lg bg-secondary/50 p-2.5 text-center text-xs text-muted-foreground">
          صاحب متجر؟ دخولك هذا يفتح إدارة متجرك تلقائياً — افتح متجرك وستجد أزرار الإدارة، ولا حاجة لدخول آخر.
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
