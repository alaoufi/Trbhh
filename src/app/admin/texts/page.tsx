import { MessageSquare, Check, ShieldAlert, BellRing } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getSetting, SETTING_MSG_TPL_AD, SETTING_MSG_TPL_ADMIN, SETTING_AD_NOTICE, SETTING_SUB_REMINDER_MSG, DEFAULT_MSG_TPL_AD, DEFAULT_MSG_TPL_ADMIN, DEFAULT_AD_NOTICE, DEFAULT_SUB_REMINDER_MSG } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { saveTextsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'النصوص' };

const box = 'w-full rounded-lg border border-primary/30 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';

export default async function AdminTexts({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved }, tplAd, tplAdmin, adNotice, subReminderMsg] = await Promise.all([
    searchParams,
    getSetting(SETTING_MSG_TPL_AD, DEFAULT_MSG_TPL_AD),
    getSetting(SETTING_MSG_TPL_ADMIN, DEFAULT_MSG_TPL_ADMIN),
    getSetting(SETTING_AD_NOTICE, DEFAULT_AD_NOTICE),
    getSetting(SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG),
  ]);
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">النصوص الظاهرة للزوّار</h1>
      </div>
      <p className="text-sm text-muted-foreground">كل نص يظهر للزائر في تربح يمكنك تعديله من هنا. (نصوص المتاجر مستقلّة تماماً — يحرّرها كل صاحب متجر من إعدادات متجره).</p>

      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم الحفظ.</div>}

      <form action={saveTextsAction} className="space-y-4 rounded-xl border border-primary/20 bg-card p-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-primary"><MessageSquare className="h-4 w-4" /> نصوص المراسلة الجاهزة</div>
          <p className="mb-2 text-xs text-muted-foreground">نصوص تُعبّأ داخل مربّع المحادثة ليعدّلها المُرسِل ويرسلها. كل سطر = نص مستقل. اتركها فارغة لإخفائها.</p>
          <label className="block space-y-1">
            <span className="text-sm font-medium">عند مراسلة صاحب الإعلان</span>
            <textarea name="msgTplAd" rows={3} defaultValue={tplAd} className={box} />
          </label>
          <label className="mt-2 block space-y-1">
            <span className="text-sm font-medium">عند مراسلة الإدارة</span>
            <textarea name="msgTplAdmin" rows={3} defaultValue={tplAdmin} className={box} />
          </label>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-primary"><ShieldAlert className="h-4 w-4" /> تنويه صفحة الإعلان</div>
          <p className="mb-2 text-xs text-muted-foreground">يظهر أسفل وسائل التواصل في صفحة تفاصيل الإعلان.</p>
          <textarea name="adNotice" rows={2} defaultValue={adNotice} className={box} />
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-primary"><BellRing className="h-4 w-4" /> رسالة تنبيه قرب انتهاء الاشتراك</div>
          <p className="mb-2 text-xs text-muted-foreground">تُرسَل لصاحب المتجر قبل انتهاء اشتراكه (عدد الأيام والمرّات من الإعدادات ← الإيرادات والتسعير). استخدم <b dir="ltr">{'{days}'}</b> لعدد الأيام المتبقية و<b dir="ltr">{'{date}'}</b> لتاريخ الانتهاء.</p>
          <textarea name="subReminderMsg" rows={3} defaultValue={subReminderMsg} className={box} />
        </div>

        <Button>حفظ</Button>
      </form>
    </div>
  );
}
