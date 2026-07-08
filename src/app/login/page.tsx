'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { LogIn } from 'lucide-react';
import { loginAction } from './actions';
import { storeLoginAction } from '../store-login/actions';
import { Button } from '@/components/ui/button';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button className="btn-3d w-full gap-2" disabled={pending}><LogIn className="h-4 w-4" /> {pending ? '...' : label}</Button>;
}

const fieldCls = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function LoginInner() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  const sp = useSearchParams();
  const reset = sp.get('reset');
  const next = sp.get('next') || '';
  const [mode, setMode] = useState<'trbhh' | 'store'>('trbhh');

  const Option = ({ value, label }: { value: 'trbhh' | 'store'; label: string }) => {
    const active = mode === value;
    return (
      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-bold transition ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-white text-muted-foreground hover:border-primary/40'}`}>
        <input type="radio" name="loginmode" value={value} checked={active} onChange={() => setMode(value)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        {label}
      </label>
    );
  };

  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card-3d rounded-xl p-6">
        {/* اختيار وجهة الدخول بدوائر واضحة — يبدّل النموذج فوراً بلا انتقال */}
        <div className="mb-4">
          <div className="mb-2 text-center text-xs font-bold text-muted-foreground">اختر وجهة الدخول</div>
          <div className="grid grid-cols-2 gap-2">
            <Option value="trbhh" label="الدخول على تربح" />
            <Option value="store" label="الدخول على متجرك" />
          </div>
        </div>

        {mode === 'trbhh' ? (
          <>
            <h1 className="mb-1 text-xl font-bold">الدخول على تربح</h1>
            <p className="mb-5 text-sm text-muted-foreground">دخول عضو منصّة تربح بنفس بياناتك المسجّلة سابقاً.</p>
            {reset && <p className="mb-3 rounded-lg border border-green-300 bg-green-50 p-2 text-sm font-bold text-green-800">تم تغيير كلمة المرور بنجاح، سجّل الدخول بها الآن.</p>}
            <form action={action} className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <input name="identifier" placeholder="الجوال أو اسم المستخدم أو البريد" className={fieldCls} />
              <input name="password" type="password" placeholder="كلمة المرور" className={fieldCls} />
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Submit label="دخول تربح" />
            </form>
            <p className="mt-3 text-center text-sm">
              <Link href="/forgot" className="font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>
            </p>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              ليس لديك حساب؟ <Link href="/register" className="text-primary hover:underline">أنشئ حساباً</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold">الدخول على متجرك</h1>
            <p className="mb-5 text-sm text-muted-foreground">ادخل لوحة متجرك باسم دخول المتجر (أو معرّفه) وكلمة مروره الخاصة، المنفصلة تماماً عن حساب تربح.</p>
            <form action={storeLoginAction} className="space-y-3">
              <input name="handle" required dir="ltr" placeholder="اسم دخول المتجر أو معرّفه" className={`${fieldCls} text-left`} />
              <input name="password" type="password" required minLength={4} placeholder="كلمة مرور المتجر" className={fieldCls} />
              <Submit label="دخول المتجر" />
            </form>
            <p className="mt-3 text-center text-sm">
              <Link href="/store-forgot" className="font-bold text-primary hover:underline">نسيت اسم الدخول أو كلمة المرور؟</Link>
            </p>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              لم تُفعّل الدخول المستقل بعد؟ ادخل على تربح كعضو ثم فعّله من «متجري ← دخول مستقل للمتجر».
            </p>
          </>
        )}
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
