import Link from 'next/link';
import { MessageSquare, Check, ShieldAlert, BellRing, Home, Megaphone, Sparkles, Inbox, Braces } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import {
  getSetting, getHomeHeadings, getEmptyTexts,
  SETTING_MSG_TPL_AD, SETTING_MSG_TPL_ADMIN, SETTING_AD_NOTICE, SETTING_SUB_REMINDER_MSG,
  SETTING_TICKER, SETTING_HOME_CLS_TITLE, SETTING_HOME_CLS_SUB,
  DEFAULT_MSG_TPL_AD, DEFAULT_MSG_TPL_ADMIN, DEFAULT_AD_NOTICE, DEFAULT_SUB_REMINDER_MSG,
  DEFAULT_TICKER, DEFAULT_HOME_CLS_TITLE, DEFAULT_HOME_CLS_SUB,
} from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { saveTextsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'النصوص' };

const box = 'w-full rounded-lg border border-primary/30 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';

const SECTIONS = [
  { key: 'vars', label: 'المتغيّرات', icon: Braces },
  { key: 'general', label: 'عام', icon: Megaphone },
  { key: 'home', label: 'الرئيسية', icon: Home },
  { key: 'ad', label: 'صفحة الإعلان', icon: Sparkles },
  { key: 'msg', label: 'المراسلة', icon: MessageSquare },
  { key: 'empty', label: 'رسائل فارغة', icon: Inbox },
  { key: 'sub', label: 'الاشتراك', icon: BellRing },
] as const;
type Sec = typeof SECTIONS[number]['key'];

// المتغيّرات المتاحة — تُكتب داخل أي نص وتُستبدل بالقيمة الفعلية عند العرض/الإرسال.
const VARIABLES = [
  { token: '{link}', meaning: 'رابط الإعلان أو المنتج أو المتجر', where: 'نصوص المراسلة — ويُضاف تلقائياً في رسائل واتساب من صفحة الإعلان/المنتج حتى لو لم تكتبه.' },
  { token: '{name}', meaning: 'اسم الإعلان/المنتج، أو اسم المتجر، أو اسم الطرف الآخر في المحادثة', where: 'نصوص المراسلة، ورسالة تنبيه الاشتراك (اسم المتجر).' },
  { token: '{days}', meaning: 'عدد الأيام المتبقية قبل انتهاء الاشتراك', where: 'رسالة تنبيه الاشتراك.' },
  { token: '{date}', meaning: 'تاريخ انتهاء الاشتراك', where: 'رسالة تنبيه الاشتراك.' },
];

export default async function AdminTexts({ searchParams }: { searchParams: Promise<{ saved?: string; sec?: string }> }) {
  await requireAction('users', 'edit');
  const { saved, sec: secRaw } = await searchParams;
  const sec: Sec = (SECTIONS.some((s) => s.key === secRaw) ? secRaw : 'general') as Sec;
  const [tplAd, tplAdmin, adNotice, subMsg, ticker, clsTitle, clsSub, headings, empty] = await Promise.all([
    getSetting(SETTING_MSG_TPL_AD, DEFAULT_MSG_TPL_AD),
    getSetting(SETTING_MSG_TPL_ADMIN, DEFAULT_MSG_TPL_ADMIN),
    getSetting(SETTING_AD_NOTICE, DEFAULT_AD_NOTICE),
    getSetting(SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG),
    getSetting(SETTING_TICKER, DEFAULT_TICKER),
    getSetting(SETTING_HOME_CLS_TITLE, DEFAULT_HOME_CLS_TITLE),
    getSetting(SETTING_HOME_CLS_SUB, DEFAULT_HOME_CLS_SUB),
    getHomeHeadings(),
    getEmptyTexts(),
  ]);

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">النصوص الظاهرة للزوّار (تربح)</h1>
      </div>
      <p className="text-sm text-muted-foreground">نصوص تربح مقسّمة حسب مكان ظهورها. (نصوص المتاجر مستقلّة تماماً — يحرّرها كل صاحب متجر من إعدادات متجره).</p>

      {/* تبويبات فرعية حسب مكان النص */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary/40 p-1.5">
        {SECTIONS.map((s) => (
          <Link key={s.key} href={`/admin/texts?sec=${s.key}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${sec === s.key ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-white/60'}`}>
            <s.icon className="h-4 w-4" /> {s.label}
          </Link>
        ))}
      </div>

      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم الحفظ.</div>}

      {sec === 'vars' && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-primary"><Braces className="h-4 w-4" /> المتغيّرات المتاحة</div>
          <p className="text-xs text-muted-foreground">اكتب المتغيّر داخل أي نص (كما هو، بالأقواس) وسيُستبدل تلقائياً بالقيمة الفعلية عند العرض أو الإرسال. مثال: «هل يتوفّر {'{name}'}؟ {'{link}'}».</p>
          <ul className="space-y-2">
            {VARIABLES.map((v) => (
              <li key={v.token} className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <code dir="ltr" className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-white">{v.token}</code>
                  <span className="text-sm font-bold text-foreground/90">{v.meaning}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">يعمل في: {v.where}</p>
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-800">ملاحظة: إن لم يتوفّر المتغيّر في سياق معيّن (مثل {'{link}'} داخل محادثة عامة) فإنه يُحذف تلقائياً دون إظهار الأقواس.</p>
        </div>
      )}

      {sec !== 'vars' && (
      <form action={saveTextsAction} className="space-y-4 rounded-xl border border-primary/20 bg-card p-4">
        <input type="hidden" name="sec" value={sec} />

        {sec === 'general' && (
          <label className="block space-y-1">
            <span className="flex items-center gap-2 text-sm font-bold text-primary"><Megaphone className="h-4 w-4" /> الشريط العلوي المتحرك</span>
            <span className="block text-xs text-muted-foreground">النص المتحرك أعلى الموقع (بعد رقم التواصل). اتركه فارغاً لإخفائه.</span>
            <textarea name="ticker" rows={2} defaultValue={ticker} className={box} />
          </label>
        )}

        {sec === 'home' && (
          <>
            <div className="text-sm font-bold text-primary">بطاقة «الإعلانات المبوّبة»</div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">العنوان</span>
              <input name="homeClsTitle" defaultValue={clsTitle} className={field} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">الوصف</span>
              <input name="homeClsSub" defaultValue={clsSub} className={field} />
            </label>
            <div className="border-t border-primary/15 pt-3 text-sm font-bold text-primary">عناوين أقسام الرئيسية</div>
            <label className="block space-y-1"><span className="text-sm font-medium">قسم المتاجر</span><input name="homeHStores" defaultValue={headings.stores} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">قسم منتجات المتاجر</span><input name="homeHProducts" defaultValue={headings.products} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">قسم الإعلانات المميّزة</span><input name="homeHFeatured" defaultValue={headings.featured} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">قسم أحدث الإعلانات</span><input name="homeHLatest" defaultValue={headings.latest} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">قسم الأكثر مشاهدة</span><input name="homeHMostviewed" defaultValue={headings.mostViewed} className={field} /></label>
          </>
        )}

        {sec === 'empty' && (
          <>
            <p className="text-xs text-muted-foreground">الرسائل التي تظهر للزائر عند عدم وجود عناصر.</p>
            <label className="block space-y-1"><span className="text-sm font-medium">لا توجد إعلانات</span><input name="emptyAds" defaultValue={empty.ads} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">لا توجد محادثات</span><input name="emptyChats" defaultValue={empty.chats} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">لا توجد متاجر</span><input name="emptyStores" defaultValue={empty.stores} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">لا توجد تقييمات</span><input name="emptyReviews" defaultValue={empty.reviews} className={field} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">لا توجد إعلانات مبوّبة</span><input name="emptyClassified" defaultValue={empty.classified} className={field} /></label>
          </>
        )}

        {sec === 'ad' && (
          <label className="block space-y-1">
            <span className="flex items-center gap-2 text-sm font-bold text-primary"><ShieldAlert className="h-4 w-4" /> تنويه صفحة الإعلان</span>
            <span className="block text-xs text-muted-foreground">يظهر أسفل وسائل التواصل في صفحة تفاصيل الإعلان. اتركه فارغاً لإخفائه.</span>
            <textarea name="adNotice" rows={2} defaultValue={adNotice} className={box} />
          </label>
        )}

        {sec === 'msg' && (
          <>
            <p className="text-xs text-muted-foreground">نصوص تُعبّأ داخل مربّع المحادثة ليعدّلها المُرسِل ويرسلها. كل سطر = نص مستقل. المتغيّرات: <b dir="ltr">{'{link}'}</b> رابط الإعلان (يُضاف تلقائياً في واتساب)، <b dir="ltr">{'{name}'}</b> اسم الإعلان/الطرف.</p>
            <label className="block space-y-1">
              <span className="text-sm font-medium">عند مراسلة صاحب الإعلان</span>
              <textarea name="msgTplAd" rows={3} defaultValue={tplAd} className={box} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">عند مراسلة الإدارة</span>
              <textarea name="msgTplAdmin" rows={3} defaultValue={tplAdmin} className={box} />
            </label>
          </>
        )}

        {sec === 'sub' && (
          <label className="block space-y-1">
            <span className="flex items-center gap-2 text-sm font-bold text-primary"><BellRing className="h-4 w-4" /> رسالة تنبيه قرب انتهاء الاشتراك</span>
            <span className="block text-xs text-muted-foreground">تُرسَل لصاحب المتجر قبل انتهاء اشتراكه (عدد الأيام والمرّات من الإعدادات ← الإيرادات والتسعير). المتغيّرات: <b dir="ltr">{'{days}'}</b> الأيام المتبقية، <b dir="ltr">{'{date}'}</b> تاريخ الانتهاء، <b dir="ltr">{'{name}'}</b> اسم المتجر.</span>
            <textarea name="subReminderMsg" rows={3} defaultValue={subMsg} className={box} />
          </label>
        )}

        <Button>حفظ</Button>
      </form>
      )}
    </div>
  );
}
