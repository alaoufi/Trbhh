import { MessageSquare, Check, Smartphone, Send, Stethoscope } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getMessagingConfig, smsDiagnose } from '@/lib/sms';
import { Button } from '@/components/ui/button';
import { saveVerificationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بوابات التحقق (SMS/واتساب)' };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ saved?: string; test?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved, test }, c] = await Promise.all([searchParams, getMessagingConfig()]);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40';
  const testPhone = (test || '').trim();
  const diag = testPhone ? await smsDiagnose(testPhone) : null;

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

      {/* اختبار البوابة — يرسل رسالة حقيقية ويعرض رد 4jawaly والسبب */}
      <form method="GET" className="space-y-2 rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><Stethoscope className="h-5 w-5" /> اختبار البوابة (يرسل رسالة تجريبية حقيقية)</div>
        <div className="flex gap-2">
          <input name="test" defaultValue={testPhone} inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" className={`${field} flex-1`} />
          <Button size="sm" type="submit"><Send className="h-4 w-4" /> اختبار</Button>
        </div>
        {diag && (
          <div className={`space-y-1 rounded-xl border-2 p-3 text-sm font-bold ${diag.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
            {diag.steps.map((s, i) => <div key={i}>{s}</div>)}
            {typeof diag.httpStatus === 'number' && <div className="text-xs font-normal text-muted-foreground">رمز HTTP: {diag.httpStatus}</div>}
            {diag.body && <pre dir="ltr" className="mt-1 max-h-40 overflow-auto rounded-lg bg-white/70 p-2 text-[11px] font-normal leading-4 text-foreground/80 whitespace-pre-wrap">{diag.body}</pre>}
          </div>
        )}
      </form>

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
            <Smartphone className="h-5 w-5" /> <h2 className="font-extrabold drop-shadow">بوابة SMS</h2>
          </div>
          <div className="space-y-3 p-4">
            <L label="نوع الواجهة">
              <select name="sms_provider" defaultValue={c.smsProvider} className={field}>
                <option value="taqnyat">تقنيات Taqnyat (رمز Bearer)</option>
                <option value="jawaly_v1">4jawaly الحديثة (app_key / app_secret)</option>
                <option value="legacy">قديمة (username / password)</option>
              </select>
            </L>
            <p className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-800">
              <b>تقنيات (Taqnyat):</b> من لوحة تقنيات ← «المطوّرون / Applications» أنشئ <b>رمز API (Bearer)</b> وضعه في حقل «السر»، واترك «المفتاح» فارغاً. ضع رابط الـAPI:
              <span dir="ltr"> https://api.taqnyat.sa/v1/messages</span>، و«اسم المرسِل» يجب أن يكون <b>معتمداً في حسابك</b> بالضبط كما هو.
            </p>
            <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
              <b>4jawaly:</b> ضع الـapp_key في «المفتاح» والـapp_secret في «السر»، ورابط الـAPI الخاص بها.
            </p>
            <L label="رابط الـAPI"><input name="sms_url" defaultValue={c.smsUrl} className={field} dir="ltr" /></L>
            <L label="المفتاح (app_key / username) — يُترك فارغاً مع تقنيات"><input name="sms_username" defaultValue={c.smsUser} className={field} dir="ltr" /></L>
            <L label="السر (app_secret / رمز تقنيات Bearer)"><input name="sms_password" defaultValue={c.smsPass} className={field} dir="ltr" /></L>
            <L label="اسم المرسِل (sender)"><input name="sms_sender" defaultValue={c.smsSender} className={field} /></L>
            <L label="الترميز (للقديمة فقط)"><input name="sms_unicode" defaultValue={c.smsUnicode} className={field} /></L>
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
