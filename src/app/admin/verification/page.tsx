import { MessageSquare, Check, Smartphone, Send } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getMessagingConfig } from '@/lib/sms';
import { Button } from '@/components/ui/button';
import { saveVerificationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بوابات التحقق (SMS/واتساب)' };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved }, c] = await Promise.all([searchParams, getMessagingConfig()]);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">بوابات التحقق (SMS / واتساب)</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        إعدادات إرسال رمز التحقّق (استعادة كلمة المرور). عدّل البيانات هنا في أي وقت دون إعادة نشر، واختر القناة المفعّلة.
      </p>

      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800"><Check className="h-4 w-4" /> تم الحفظ.</div>}

      <form action={saveVerificationAction} className="space-y-4">
        {/* channel + enable */}
        <div className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="enabled" defaultChecked={c.enabled} className="h-4 w-4 accent-primary" />
            تفعيل خدمة استعادة كلمة المرور
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold">قناة الإرسال المفعّلة</span>
            <select name="channel" defaultValue={c.channel} className={field}>
              <option value="sms">رسائل SMS فقط</option>
              <option value="whatsapp">واتساب فقط</option>
              <option value="both">الاثنان معاً (SMS + واتساب)</option>
            </select>
          </label>
        </div>

        {/* SMS */}
        <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-gradient-to-br from-emerald-600 to-emerald-800 p-3 text-white">
            <Smartphone className="h-5 w-5" /> <h2 className="font-extrabold drop-shadow">بوابة SMS (4jawaly)</h2>
          </div>
          <div className="space-y-3 p-4">
            <L label="رابط الـAPI"><input name="sms_url" defaultValue={c.smsUrl} className={field} /></L>
            <L label="اسم المستخدم (username)"><input name="sms_username" defaultValue={c.smsUser} className={field} /></L>
            <L label="كلمة المرور (password)"><input name="sms_password" defaultValue={c.smsPass} className={field} /></L>
            <L label="اسم المرسِل (sender)"><input name="sms_sender" defaultValue={c.smsSender} className={field} /></L>
            <L label="الترميز (unicode)"><input name="sms_unicode" defaultValue={c.smsUnicode} className={field} /></L>
          </div>
        </section>

        {/* WhatsApp */}
        <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-gradient-to-br from-green-600 to-green-800 p-3 text-white">
            <Send className="h-5 w-5" /> <h2 className="font-extrabold drop-shadow">بوابة واتساب (4whats)</h2>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-xs font-bold text-amber-700">إن كانت خدمة الواتساب متوقّفة، اترك القناة على «SMS فقط».</p>
            <L label="رابط الـAPI"><input name="wa_url" defaultValue={c.waUrl} className={field} /></L>
            <L label="instanceid"><input name="wa_instance" defaultValue={c.waInstance} className={field} /></L>
            <L label="token"><input name="wa_token" defaultValue={c.waToken} className={field} /></L>
          </div>
        </section>

        <Button className="w-full">حفظ الإعدادات</Button>
      </form>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}
