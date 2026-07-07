import Link from 'next/link';
import { Store, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storeLoginAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'دخول المتاجر' };

export default async function StoreLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const field = 'h-12 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40';
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-white"><Store className="h-8 w-8" /></span>
      <div className="text-center">
        <h1 className="text-xl font-extrabold text-primary">دخول أصحاب المتاجر</h1>
        <p className="mt-1 text-sm text-muted-foreground">ادخل لوحة متجرك مباشرة باسم دخول المتجر (أو معرّفه) وكلمة مروره الخاصة، المنفصلة تماماً عن حساب تربح.</p>
      </div>

      {error === '1' && (
        <div className="w-full rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
          اسم الدخول أو كلمة المرور غير صحيحة.
        </div>
      )}

      <form action={storeLoginAction} className="w-full space-y-3">
        <input name="handle" required dir="ltr" placeholder="اسم دخول المتجر أو معرّفه" className={`${field} text-left`} />
        <input name="password" type="password" required minLength={4} placeholder="كلمة مرور المتجر" className={field} />
        <Button className="w-full gap-2"><LogIn className="h-4 w-4" /> دخول المتجر</Button>
      </form>

      <div className="text-center text-xs text-muted-foreground">
        لست صاحب متجر؟ <Link href="/login" className="font-bold text-primary underline">دخول تربح كعضو</Link>
        <div className="mt-1">لم تُفعّل الدخول المستقل بعد؟ ادخل كعضو ثم فعّله من «متجري ← دخول مستقل للمتجر».</div>
      </div>
    </div>
  );
}
