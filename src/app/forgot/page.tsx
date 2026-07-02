import Link from 'next/link';
import { KeyRound, Phone, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendCodeAction, resetAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'استعادة كلمة المرور' };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ phone?: string; sent?: string; error?: string }> }) {
  const { phone = '', sent, error } = await searchParams;
  const field = 'h-11 w-full rounded-lg border border-primary/30 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <div className="flex items-center gap-2">
        <Link href="/login" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><KeyRound className="h-5 w-5" /> استعادة كلمة المرور</h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!sent ? (
        <form action={sendCodeAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
          <p className="text-sm font-bold text-muted-foreground">أدخل رقم جوالك المسجّل، وسنرسل لك رمز تحقّق عبر رسالة نصية.</p>
          <label className="block space-y-1">
            <span className="flex items-center gap-1 text-sm font-bold"><Phone className="h-4 w-4" /> رقم الجوال</span>
            <input name="phone" inputMode="tel" required placeholder="05xxxxxxxx" defaultValue={phone} className={field} />
          </label>
          <Button className="w-full">إرسال الرمز</Button>
        </form>
      ) : (
        <form action={resetAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
          <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-2 text-xs font-bold text-green-800">
            <ShieldCheck className="h-4 w-4 shrink-0" /> أرسلنا رمزاً إلى {phone}. أدخله مع كلمة المرور الجديدة.
          </div>
          <input type="hidden" name="phone" value={phone} />
          <label className="block space-y-1">
            <span className="text-sm font-bold">رمز التحقّق</span>
            <input name="code" inputMode="numeric" maxLength={6} required placeholder="######" className={`${field} tracking-[0.5em] text-center`} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold">كلمة المرور الجديدة</span>
            <input name="password" type="password" required minLength={6} placeholder="6 أحرف على الأقل" className={field} />
          </label>
          <Button className="w-full">تعيين كلمة المرور</Button>
          <div className="text-center">
            <Link href={`/forgot?phone=${encodeURIComponent(phone)}`} className="text-xs font-bold text-primary hover:underline">لم يصلك الرمز؟ إعادة الإرسال</Link>
          </div>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        تذكّرت كلمة المرور؟ <Link href="/login" className="font-bold text-primary hover:underline">تسجيل الدخول</Link>
      </p>
    </div>
  );
}
