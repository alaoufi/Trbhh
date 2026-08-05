'use client';
import {
  Wallet, HandCoins, Copy, Check, Landmark, Camera, Send, Clock, CheckCircle2, MessageCircle,
  Sparkles, Crown, PlusCircle, Image as ImageIcon, Phone as PhoneIcon, Store, Palette, Rocket,
  ShieldCheck, BadgeCheck, Eye, BarChart3, Share2,
} from 'lucide-react';
import { TutorialPlayer, Phone, Tap, CountUp, type TutorialSlide } from '@/components/tutorial-player';

/* ============================ شحن الرصيد ============================ */
const TOPUP_SLIDES: TutorialSlide[] = [
  {
    caption: 'من لوحة حسابك اضغط بطاقة «شحن رصيدك»',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">مرحباً بك 👋</div>
        <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-sky-100 text-sky-700">📢</span> إعلاناتي</div>
        <div className="relative flex items-center gap-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2.5 text-xs font-extrabold text-emerald-800 shadow tut-pulse">
          <Wallet className="h-5 w-5" /> شحن رصيدك
          <span className="mr-auto rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">رصيدك: 0 ر.س</span>
          <Tap className="-bottom-3 left-8" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-amber-100 text-amber-700">⭐</span> تقييماتي</div>
      </div>
    ),
  },
  {
    caption: 'انسخ بيانات الحساب: البنك، رقم الحساب، الآيبان، والاسم — وتأكد من الاسم قبل التحويل',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><HandCoins className="h-4 w-4" /> شحن رصيدك</div>
        <div className="space-y-1.5 rounded-xl border-2 border-sky-200 bg-white p-2.5 text-[11px]">
          <div className="flex items-center justify-between"><span><b className="text-slate-400">البنك:</b> <b>مصرف الراجحي</b></span><span className="rounded-full border border-sky-300 px-2 py-0.5 text-[9px] font-bold text-sky-700">نسخ</span></div>
          <div className="flex items-center justify-between"><span><b className="text-slate-400">رقم الحساب:</b> <b dir="ltr" className="text-sky-700">1234567890</b></span><span className="rounded-full border border-sky-300 px-2 py-0.5 text-[9px] font-bold text-sky-700">نسخ</span></div>
          <div className="relative flex items-center justify-between">
            <span><b className="text-slate-400">الآيبان:</b> <b dir="ltr" className="text-sky-700">SA00 0000…</b></span>
            <span className="tut-copyflash rounded-full border px-2 py-0.5 text-[9px] font-bold">نسخ</span>
            <Tap className="-bottom-4 left-2" />
          </div>
          <div><b className="text-slate-400">اسم صاحب الحساب:</b> <b>شركة عقار تربح</b>
            <div className="mt-0.5 text-[10px] font-bold text-amber-700">⚠ تأكد من الاسم قبل التحويل</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    caption: 'حوّل المبلغ من تطبيق بنكك ثم التقط صورة الإيصال',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-xl bg-slate-800 p-3 text-white">
          <div className="flex items-center gap-1.5 text-xs font-bold"><Landmark className="h-4 w-4" /> تطبيق البنك</div>
          <div className="mt-2 rounded-lg bg-slate-700 p-2 text-[11px]">المستفيد: <b>شركة عقار تربح</b></div>
          <div className="mt-1.5 rounded-lg bg-slate-700 p-2 text-[11px]">المبلغ: <b className="text-emerald-300">100 ر.س</b></div>
          <div className="relative mt-2 rounded-lg bg-emerald-500 p-2 text-center text-xs font-extrabold tut-pulse">تحويل ✓<Tap className="-bottom-3 left-10" /></div>
        </div>
        <div className="tut-rise flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-2.5 text-xs font-bold text-sky-800">
          <Camera className="h-5 w-5" /> صورة الإيصال 🧾
        </div>
      </div>
    ),
  },
  {
    caption: 'ارجع إلى «شحن رصيدك»: اكتب المبلغ وأرفق صورة الإيصال ثم أرسل الطلب',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><HandCoins className="h-4 w-4" /> شحن رصيدك</div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">المبلغ (ر.س)</div>
          <div className="tut-type overflow-hidden whitespace-nowrap text-base font-extrabold text-slate-800">100</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">إيصال التحويل</div>
          <div className="tut-rise flex items-center gap-1.5 font-bold text-emerald-700"><Check className="h-4 w-4" /> receipt.jpg 🧾</div>
        </div>
        <div className="relative rounded-lg bg-sky-600 p-2.5 text-center text-xs font-extrabold text-white tut-pulse">
          <span className="inline-flex items-center gap-1.5"><Send className="h-4 w-4" /> إرسال طلب الشحن</span>
          <Tap className="-bottom-3 left-12" />
        </div>
      </div>
    ),
  },
  {
    caption: 'وصل طلبك للإدارة — تتحقق من وصول المبلغ ثم تؤكده',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="tut-spin-slow grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-9 w-9" /></span>
        <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">بانتظار تأكيد الإدارة</div>
        <p className="text-[11px] font-bold text-slate-500">تراجع الإدارة الإيصال وتتأكد من وصول المبلغ في الحساب</p>
      </div>
    ),
  },
  {
    caption: 'بعد التأكيد: يُضاف المبلغ لرصيدك فوراً وتصلك رسالة شكر',
    body: (active) => (
      <div className="space-y-3">
        <div className="rounded-xl border-2 border-emerald-400 bg-white p-3 text-center">
          <div className="text-[11px] font-bold text-slate-400">الرصيد المتاح</div>
          <div className="text-3xl font-extrabold text-emerald-600"><CountUp active={active} /> <span className="text-sm">ر.س</span></div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> تم التأكيد</div>
        </div>
        <div className="tut-rise flex items-start gap-1.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-600 text-white"><MessageCircle className="h-4 w-4" /></span>
          <div className="rounded-2xl rounded-tr-sm bg-sky-50 p-2 text-[10px] font-bold leading-relaxed text-slate-700">شكراً لثقتك في عقار تربح 🎉 تم إضافة رصيد بمبلغ 100 ر.س — يمكنك استخدامه في المدفوعات المختلفة.</div>
        </div>
      </div>
    ),
  },
  {
    caption: 'استخدم رصيدك في كل الخدمات — يُخصم تلقائياً وكل حركة مسجّلة في محفظتك',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-2.5">
        {[
          { icon: Crown, t: 'تمييز إعلانك', c: 'bg-amber-100 text-amber-700' },
          { icon: Sparkles, t: 'إعلان مبوّب بالمصمم الذكي', c: 'bg-violet-100 text-violet-700' },
          { icon: Copy, t: 'باقات التكرار', c: 'bg-sky-100 text-sky-700' },
        ].map((x, k) => (
          <div key={k} className="tut-rise flex w-full items-center gap-2 rounded-xl bg-white p-2.5 text-xs font-extrabold shadow" style={{ animationDelay: `${k * 0.35}s` }}>
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${x.c}`}><x.icon className="h-4 w-4" /></span> {x.t}
          </div>
        ))}
      </div>
    ),
  },
];
export function TopupTutorial() {
  return <TutorialPlayer slides={TOPUP_SLIDES} shareTitle="شرح شحن الرصيد — عقار تربح" ctaHref="/account/wallet#topup" ctaLabel="🪙 ابدأ شحن رصيدك الآن" />;
}

/* ============================ إضافة إعلان ============================ */
const ADD_AD_SLIDES: TutorialSlide[] = [
  {
    caption: 'سجّل الدخول ثم اضغط زر «أضف إعلان»',
    body: () => (
      <div className="flex h-full flex-col">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">الرئيسية</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((k) => <div key={k} className="h-16 rounded-lg bg-white shadow-sm" />)}
        </div>
        <div className="relative mt-auto flex items-center justify-around rounded-xl bg-white p-2 shadow">
          <span className="text-[10px] font-bold text-slate-400">الرئيسية</span>
          <span className="tut-pulse relative grid h-11 w-11 place-items-center rounded-full bg-sky-600 text-white shadow-lg"><PlusCircle className="h-6 w-6" /><Tap className="-bottom-4 left-5" /></span>
          <span className="text-[10px] font-bold text-slate-400">الرسائل</span>
        </div>
      </div>
    ),
  },
  {
    caption: 'اكتب عنواناً واضحاً، ثم التفاصيل والسعر',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><PlusCircle className="h-4 w-4" /> أضف إعلان</div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">العنوان</div>
          <div className="tut-type overflow-hidden whitespace-nowrap text-sm font-extrabold text-slate-800">جوال آيفون 15 برو نظيف</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">التفاصيل</div>
          <div className="h-10 rounded bg-slate-100" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">السعر (ر.س)</div>
          <div className="text-sm font-extrabold text-emerald-700">3500</div>
        </div>
      </div>
    ),
  },
  {
    caption: 'اختر القسم والمدينة ليصل إعلانك للمهتمين',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg border-2 border-sky-300 bg-white p-2 text-[11px] tut-pulse">
          <div className="text-slate-400">القسم</div>
          <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">📱 جوالات وأجهزة <span>▾</span></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">المدينة</div>
          <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">📍 الرياض <span>▾</span></div>
        </div>
        <div className="tut-rise rounded-lg bg-sky-50 p-2 text-[10px] font-bold text-sky-800">اختيار القسم الصحيح يعرض إعلانك لمن يبحث عنه فعلاً.</div>
      </div>
    ),
  },
  {
    caption: 'أرفق صوراً واضحة — ويمكنك إضافة فيديو أو تسجيل صوتي',
    body: () => (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((k) => (
            <div key={k} className="tut-rise grid h-16 place-items-center rounded-lg bg-white text-slate-300 shadow-sm" style={{ animationDelay: `${k * 0.3}s` }}>
              <ImageIcon className="h-6 w-6" />
            </div>
          ))}
        </div>
        <div className="relative grid place-items-center rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-3 text-xs font-bold text-sky-800 tut-pulse">
          <Camera className="mb-1 h-6 w-6" /> أضف صوراً واضحة
          <Tap className="-bottom-3 left-12" />
        </div>
        <div className="flex gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">🎬 فيديو</span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">🎙 تسجيل صوتي</span>
        </div>
      </div>
    ),
  },
  {
    caption: 'أضف وسيلة التواصل (جوال/واتساب) ثم اضغط «نشر»',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">رقم التواصل</div>
          <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><PhoneIcon className="h-4 w-4 text-emerald-600" /> 05xxxxxxxx</div>
        </div>
        <div className="flex gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">✓ واتساب</span>
          <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700">✓ اتصال</span>
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">✓ مراسلة داخلية</span>
        </div>
        <div className="relative rounded-lg bg-sky-600 p-2.5 text-center text-xs font-extrabold text-white tut-pulse">
          <span className="inline-flex items-center gap-1.5"><Send className="h-4 w-4" /> نشر الإعلان</span>
          <Tap className="-bottom-3 left-12" />
        </div>
      </div>
    ),
  },
  {
    caption: 'إذا كانت مراجعة الإعلانات مفعّلة يظهر «بانتظار الموافقة» ثم يُنشر بعد اعتماد الإدارة',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="tut-spin-slow grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-9 w-9" /></span>
        <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">بانتظار الموافقة</div>
        <p className="text-[11px] font-bold text-slate-500">تتأكد الإدارة من مطابقة الإعلان للشروط ثم يُنشر مباشرة</p>
      </div>
    ),
  },
  {
    caption: 'مبروك! إعلانك ظاهر الآن — تابع مشاهداته وعدّل عليه من «إعلاناتي»',
    body: (active) => (
      <div className="space-y-2">
        <div className="tut-rise overflow-hidden rounded-xl bg-white shadow">
          <div className="grid h-20 place-items-center bg-slate-100 text-slate-300"><ImageIcon className="h-8 w-8" /></div>
          <div className="p-2">
            <div className="text-xs font-extrabold text-slate-800">جوال آيفون 15 برو نظيف</div>
            <div className="mt-1 flex items-center justify-between text-[10px] font-bold">
              <span className="text-emerald-700">3500 ر.س</span>
              <span className="flex items-center gap-1 text-slate-400"><Eye className="h-3.5 w-3.5" /> <CountUp active={active} to={40} step={2} /> مشاهدة</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700">✏️ تعديل</span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700"><Crown className="inline h-3 w-3" /> تمييز</span>
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700"><Share2 className="inline h-3 w-3" /> مشاركة</span>
        </div>
      </div>
    ),
  },
];
export function AddAdTutorial() {
  return <TutorialPlayer slides={ADD_AD_SLIDES} shareTitle="شرح إضافة إعلان — عقار تربح" ctaHref="/ads/new" ctaLabel="📢 أضف إعلانك الآن" />;
}

/* ============================ إنشاء متجر ============================ */
const OPEN_STORE_SLIDES: TutorialSlide[] = [
  {
    caption: 'من الرئيسية اضغط بانر «افتح متجرك» — تجربة مجانية ثم اشتراك',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">الرئيسية</div>
        <div className="relative rounded-xl bg-gradient-to-l from-teal-600 to-emerald-700 p-3 text-white shadow-lg tut-pulse">
          <div className="flex items-center gap-2 text-sm font-extrabold"><Store className="h-5 w-5" /> افتح متجرك</div>
          <div className="mt-1 text-[10px] font-bold text-white/90">جرّبه مجاناً ثم اشترك للاستمرار</div>
          <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-extrabold text-amber-900">تجربة مجانية</span>
          <Tap className="-bottom-3 left-14" />
        </div>
        <div className="grid grid-cols-2 gap-2">{[1, 2].map((k) => <div key={k} className="h-14 rounded-lg bg-white shadow-sm" />)}</div>
      </div>
    ),
  },
  {
    caption: 'وافق على شروط المتجر وتحمّل مسؤولية منتجاتك',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-teal-800"><Store className="h-4 w-4" /> فتح متجر جديد</div>
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] leading-relaxed text-slate-500">
          شروط المتجر: تلتزم بعرض منتجات نظامية، وتتحمّل مسؤولية منتجاتك وتعاملاتك…
        </div>
        <div className="tut-rise flex items-center gap-2 rounded-lg border-2 border-teal-400 bg-teal-50 p-2 text-[11px] font-extrabold text-teal-800">
          <Check className="h-4 w-4 rounded bg-teal-600 p-0.5 text-white" /> أوافق على الشروط
        </div>
        <div className="relative rounded-lg bg-teal-600 p-2.5 text-center text-xs font-extrabold text-white tut-pulse">إنشاء المتجر<Tap className="-bottom-3 left-12" /></div>
      </div>
    ),
  },
  {
    caption: 'أكمل بيانات النشاط: الاسم والتخصص والشعار — الاسم يخضع لقواعد الأسماء المسموحة',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
          <div className="text-slate-400">اسم المتجر</div>
          <div className="tut-type overflow-hidden whitespace-nowrap text-sm font-extrabold text-slate-800">متجر النخبة للأجهزة</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]"><div className="text-slate-400">التخصص</div><div className="text-xs font-extrabold">إلكترونيات</div></div>
          <div className="grid place-items-center rounded-lg border-2 border-dashed border-teal-300 bg-teal-50 p-2 text-[10px] font-bold text-teal-700"><Camera className="mb-0.5 h-4 w-4" /> الشعار</div>
        </div>
        <div className="tut-rise rounded-lg bg-amber-50 p-2 text-[10px] font-bold text-amber-800">⚠ الأسماء المخالفة تُرفض ولا تُقبل إلا بموافقة الإدارة.</div>
      </div>
    ),
  },
  {
    caption: 'اختر تصميم واجهتك ولونك وشكل الكتالوج من «مكتبة التصاميم»',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-violet-800"><Palette className="h-4 w-4" /> مكتبة التصاميم</div>
        <div className="grid grid-cols-3 gap-1.5">
          {['#0d9488', '#7c3aed', '#dc2626', '#0284c7', '#d97706', '#16a34a'].map((c, k) => (
            <div key={k} className={`tut-rise h-12 rounded-lg shadow-sm ${k === 0 ? 'ring-2 ring-offset-1' : ''}`} style={{ background: c, animationDelay: `${k * 0.15}s` }} />
          ))}
        </div>
        <div className="flex gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-white px-2 py-1 shadow-sm">شبكة</span>
          <span className="rounded-full bg-teal-600 px-2 py-1 text-white">بطاقات ✓</span>
          <span className="rounded-full bg-white px-2 py-1 shadow-sm">معرض</span>
        </div>
      </div>
    ),
  },
  {
    caption: 'أضف منتجاتك داخل متجرك — مستقلة تماماً عن سياسات عقار تربح',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-teal-600 p-2 text-xs font-extrabold text-white">
          <span className="flex items-center gap-1.5"><Store className="h-4 w-4" /> متجر النخبة</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px]">+ أضف إعلان</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="tut-rise overflow-hidden rounded-lg bg-white shadow-sm" style={{ animationDelay: `${k * 0.25}s` }}>
              <div className="grid h-12 place-items-center bg-slate-100 text-slate-300"><ImageIcon className="h-5 w-5" /></div>
              <div className="p-1.5 text-[9px] font-bold">منتج {k + 1}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    caption: 'يعتمد متجرك من الإدارة ثم يظهر للعملاء — والتجربة المجانية بدأت من لحظة الإنشاء',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="tut-rise grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></span>
        <div className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-extrabold text-emerald-800">تم اعتماد متجرك ✓</div>
        <div className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-extrabold text-amber-800">⏳ التجربة المجانية سارية — راسل الإدارة لتمديدها</div>
      </div>
    ),
  },
  {
    caption: 'شارك رابط متجرك وثبّته كتطبيق مستقل باسمه وشعاره — وبعد التجربة اشترك للاستمرار',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-2.5">
        {[
          { icon: Share2, t: 'رابط متجرك المباشر — شاركه بكل مكان', c: 'bg-sky-100 text-sky-700' },
          { icon: Rocket, t: 'عملاؤك يثبّتونه كتطبيق مستقل', c: 'bg-violet-100 text-violet-700' },
          { icon: Crown, t: 'اشترك (شهري/٦ أشهر/سنوي) للاستمرار', c: 'bg-amber-100 text-amber-700' },
        ].map((x, k) => (
          <div key={k} className="tut-rise flex w-full items-center gap-2 rounded-xl bg-white p-2.5 text-xs font-extrabold shadow" style={{ animationDelay: `${k * 0.35}s` }}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${x.c}`}><x.icon className="h-4 w-4" /></span> {x.t}
          </div>
        ))}
      </div>
    ),
  },
];
export function OpenStoreTutorial() {
  return <TutorialPlayer slides={OPEN_STORE_SLIDES} shareTitle="شرح إنشاء متجر — عقار تربح" ctaHref="/store" ctaLabel="🏪 افتح متجرك الآن" />;
}

/* ============================ توثيق الحساب ============================ */
const VERIFY_SLIDES: TutorialSlide[] = [
  {
    caption: 'من لوحة حسابك اختر «توثيق الحساب»',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">حسابي</div>
        <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-sky-100 text-sky-700">📢</span> إعلاناتي</div>
        <div className="relative flex items-center gap-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2.5 text-xs font-extrabold text-emerald-800 shadow tut-pulse">
          <ShieldCheck className="h-5 w-5" /> توثيق الحساب
          <Tap className="-bottom-3 left-8" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-emerald-100 text-emerald-700">💰</span> محفظتي</div>
      </div>
    ),
  },
  {
    caption: 'ارفع وثائقك الرسمية: الهوية أو السجل التجاري أو رخصة العمل',
    body: () => (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-800"><ShieldCheck className="h-4 w-4" /> توثيق الحساب</div>
        {['الهوية الوطنية', 'السجل التجاري', 'رخصة العمل'].map((t, k) => (
          <div key={k} className="tut-rise flex items-center justify-between rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-2 text-[11px] font-bold text-emerald-800" style={{ animationDelay: `${k * 0.3}s` }}>
            <span className="flex items-center gap-1.5"><Camera className="h-4 w-4" /> {t}</span>
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] text-white">رفع</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    caption: 'أرسل الطلب — تراجع الإدارة وثائقك',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="tut-spin-slow grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-9 w-9" /></span>
        <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">بانتظار مراجعة الإدارة</div>
        <p className="text-[11px] font-bold text-slate-500">وثائقك سرّية ولا يطّلع عليها إلا الإدارة</p>
      </div>
    ),
  },
  {
    caption: 'بعد الاعتماد: شارة «موثّق» تظهر على ملفك وإعلاناتك وتصلك رسالة تهنئة',
    body: () => (
      <div className="space-y-3">
        <div className="tut-rise flex items-center gap-2 rounded-xl bg-white p-3 shadow">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-lg">👤</span>
          <div className="text-xs font-extrabold text-slate-800">أبو محمد</div>
          <span className="mr-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-extrabold text-emerald-800"><BadgeCheck className="h-3.5 w-3.5" /> موثّق</span>
        </div>
        <div className="tut-rise flex items-start gap-1.5" style={{ animationDelay: '.4s' }}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-600 text-white"><MessageCircle className="h-4 w-4" /></span>
          <div className="rounded-2xl rounded-tr-sm bg-sky-50 p-2 text-[10px] font-bold leading-relaxed text-slate-700">تهانينا 🎉 تم توثيق حسابك في عقار تربح — تظهر الآن شارة «موثّق» على ملفك وإعلاناتك.</div>
        </div>
        <p className="text-center text-[10px] font-bold text-slate-500">الشارة تزيد ثقة العملاء بك وبإعلاناتك</p>
      </div>
    ),
  },
  {
    caption: 'إن رُفض الطلب تصلك رسالة بالسبب — عالجه وأعد رفع الوثائق من جديد',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="tut-rise w-full rounded-xl border border-red-200 bg-red-50 p-2.5 text-[10px] font-bold leading-relaxed text-red-700">نعتذر، لم يُقبل طلب التوثيق. السبب: صورة الهوية غير واضحة.</div>
        <div className="tut-rise rounded-full bg-sky-100 px-3 py-1.5 text-[11px] font-extrabold text-sky-800" style={{ animationDelay: '.4s' }}>📤 أعد رفع الوثائق بعد المعالجة</div>
      </div>
    ),
  },
];
export function VerifyTutorial() {
  return <TutorialPlayer slides={VERIFY_SLIDES} shareTitle="شرح توثيق الحساب — عقار تربح" ctaHref="/account/verify" ctaLabel="✅ وثّق حسابك الآن" />;
}

/* ============================ تمييز الإعلان ============================ */
const FEATURE_AD_SLIDES: TutorialSlide[] = [
  {
    caption: 'تأكد أن رصيدك يكفي — وإن احتجت اشحنه (شرح الشحن مستقل)',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="w-full rounded-xl border-2 border-emerald-400 bg-white p-3 text-center">
          <div className="text-[11px] font-bold text-slate-400">الرصيد المتاح</div>
          <div className="text-3xl font-extrabold text-emerald-600">100 <span className="text-sm">ر.س</span></div>
        </div>
        <div className="tut-rise rounded-full bg-sky-100 px-3 py-1.5 text-[11px] font-extrabold text-sky-800">🪙 الرصيد يُستخدم للتمييز والمبوّب والباقات</div>
      </div>
    ),
  },
  {
    caption: 'من «إعلاناتي» افتح إعلانك واضغط «تمييز»',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">إعلاناتي</div>
        <div className="overflow-hidden rounded-xl bg-white shadow">
          <div className="grid h-16 place-items-center bg-slate-100 text-slate-300"><ImageIcon className="h-6 w-6" /></div>
          <div className="space-y-1.5 p-2">
            <div className="text-xs font-extrabold text-slate-800">جوال آيفون 15 برو نظيف</div>
            <div className="relative flex items-center justify-center gap-1 rounded-lg bg-amber-500 p-2 text-[11px] font-extrabold text-white tut-pulse">
              <Crown className="h-4 w-4" /> تمييز الإعلان
              <Tap className="-bottom-3 left-10" />
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    caption: 'اختر المدة — يظهر السعر ويُخصم من رصيدك مباشرة',
    body: () => (
      <div className="space-y-2">
        <div className="text-sm font-extrabold text-amber-700">اختر مدة التمييز</div>
        {[['أسبوعان', '30'], ['شهر', '50'], ['سنة', '300']].map(([t, p], k) => (
          <div key={k} className={`tut-rise flex items-center justify-between rounded-lg p-2.5 text-[11px] font-extrabold ${k === 1 ? 'border-2 border-amber-500 bg-amber-50 text-amber-800' : 'border border-slate-200 bg-white text-slate-600'}`} style={{ animationDelay: `${k * 0.25}s` }}>
            <span>{t}</span><span>{p} ر.س {k === 1 && '✓'}</span>
          </div>
        ))}
        <div className="rounded-lg bg-emerald-50 p-2 text-center text-[10px] font-bold text-emerald-800">يُخصم من رصيدك وتُسجَّل الحركة في محفظتك</div>
      </div>
    ),
  },
  {
    caption: 'إعلانك المميّز بإطار بارز وفي مقدمة القوائم وأعلى الرئيسية',
    body: () => (
      <div className="space-y-2">
        <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">الرئيسية — الإعلانات المميّزة</div>
        <div className="tut-rise overflow-hidden rounded-xl bg-white shadow-lg ring-2 ring-amber-400">
          <div className="relative grid h-20 place-items-center bg-slate-100 text-slate-300">
            <ImageIcon className="h-8 w-8" />
            <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold text-white"><Crown className="h-3 w-3" /> مميّز</span>
          </div>
          <div className="p-2 text-xs font-extrabold text-slate-800">جوال آيفون 15 برو نظيف</div>
        </div>
        <div className="h-12 rounded-lg bg-white opacity-60 shadow-sm" />
      </div>
    ),
  },
  {
    caption: 'تابع النتيجة: مشاهدات أعلى وتواصل أكثر — من «تحليلات إعلاناتي»',
    body: (active) => (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="flex w-full items-center gap-2 rounded-xl bg-white p-3 shadow">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-100 text-sky-700"><BarChart3 className="h-5 w-5" /></span>
          <div className="text-xs font-extrabold text-slate-800">المشاهدات اليوم</div>
          <div className="mr-auto text-xl font-extrabold text-sky-700"><CountUp active={active} to={250} step={12} /></div>
        </div>
        <div className="flex items-end gap-1">
          {[3, 5, 4, 7, 9, 12].map((h, k) => <div key={k} className="tut-rise w-5 rounded-t bg-sky-500" style={{ height: h * 8, animationDelay: `${k * 0.15}s` }} />)}
        </div>
      </div>
    ),
  },
];
export function FeatureAdTutorial() {
  return <TutorialPlayer slides={FEATURE_AD_SLIDES} shareTitle="شرح تمييز الإعلان — عقار تربح" ctaHref="/account/ads" ctaLabel="👑 ميّز إعلانك الآن" />;
}

/* ============== مميزات تزيد في تسويق إعلانك ============== */
/** بطاقة إعلان مصغّرة للمعاينة داخل الشرائح. */
function MiniAd({ frame, badge, note, delay = 0 }: { frame?: 'gold' | 'plain'; badge?: React.ReactNode; note?: string; delay?: number }) {
  return (
    <div className={`tut-rise relative overflow-hidden rounded-xl bg-white shadow ${frame === 'gold' ? 'border-2 border-amber-400 ring-2 ring-amber-400/60' : 'border border-slate-200'}`} style={{ animationDelay: `${delay}s` }}>
      {frame === 'gold' && <div className="flex items-center justify-center gap-1 bg-gradient-to-l from-amber-500 to-amber-600 py-0.5 text-[9px] font-extrabold text-white">👑 إعلان ذهبي مميّز</div>}
      {badge}
      <div className="flex items-center gap-2 p-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-base">📦</span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-extrabold text-slate-800">عنوان إعلانك هنا</span>
          {note && <span className="block text-[9px] text-slate-400">{note}</span>}
        </span>
      </div>
    </div>
  );
}

const AD_BOOST_SLIDES: TutorialSlide[] = [
  {
    caption: 'إعلانك العادي يظهر بين عشرات الإعلانات — المميزات تجعله يتصدّر ويلفت العين',
    body: () => (
      <div className="space-y-2">
        <MiniAd note="إعلان عادي" />
        <MiniAd note="إعلان عادي" delay={0.25} />
        <MiniAd note="إعلانك… وسط الزحام 😐" delay={0.5} />
      </div>
    ),
  },
  {
    caption: 'التمييز ⭐: إطار ذهبي بارز ومقدمة القوائم طوال المدة — هكذا يصبح شكل إعلانك',
    body: () => (
      <div className="space-y-2">
        <MiniAd frame="gold" note="إعلانك المميّز — في المقدمة دائماً" />
        <MiniAd note="إعلان عادي" delay={0.35} />
        <div className="tut-rise rounded-lg bg-amber-50 p-2 text-[10px] font-bold text-amber-800" style={{ animationDelay: '0.6s' }}>اختر مدة التمييز من نموذج النشر أو من صفحة إعلانك — مشاهدات وتواصل أعلى بكثير.</div>
      </div>
    ),
  },
  {
    caption: 'شارة عاجل 🔥: شارة حمراء نابضة تلفت العين في كل القوائم لساعات محددة',
    body: () => (
      <div className="space-y-2">
        <MiniAd badge={<span className="absolute left-2 top-2 animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-extrabold text-white">🔥 عاجل</span>} note="إعلانك بشارة عاجل — يقفز للعين فوراً" />
        <div className="tut-rise rounded-lg bg-red-50 p-2 text-[10px] font-bold text-red-700" style={{ animationDelay: '0.4s' }}>مثالية للعروض المستعجلة والتصفيات — علّم خيارها عند النشر أو فعّلها من صفحة إعلانك.</div>
      </div>
    ),
  },
  {
    caption: 'التحديث ⬆: بضغطة واحدة يرتفع إعلانك لأعلى القوائم من جديد',
    body: () => (
      <div className="space-y-2">
        <div className="tut-rise flex items-center justify-center rounded-lg bg-sky-50 p-1.5 text-lg">⬆️</div>
        <MiniAd note="إعلانك — عاد للصدارة الآن" />
        <div className="tut-rise rounded-lg bg-sky-50 p-2 text-[10px] font-bold text-sky-800" style={{ animationDelay: '0.4s' }}>زر «⬆ تحديث» في «إعلاناتي»: مجاني كل عدة أيام، وقبل موعده برسوم رمزية.</div>
      </div>
    ),
  },
  {
    caption: 'وأكثر: جدولة النشر 🕒، عروض اليوم 🔥 بخصم ظاهر، وفتح مزاد 🔨 على إعلانك',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-2.5">
        {[
          { e: '🕒', t: 'جدولة النشر — يُنشر تلقائياً في الوقت الأنسب' },
          { e: '🔥', t: 'عروض اليوم — سعر قبل الخصم ونسبة خصم تجذب المشترين' },
          { e: '🔨', t: 'المزاد — دع المشترين يتنافسون على سعر إعلانك' },
        ].map((x, k) => (
          <div key={k} className="tut-rise flex w-full items-center gap-2 rounded-xl bg-white p-2.5 text-[11px] font-extrabold shadow" style={{ animationDelay: `${k * 0.35}s` }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-base">{x.e}</span> {x.t}
          </div>
        ))}
      </div>
    ),
  },
  {
    caption: 'القاعدة بسيطة: رصيدك يغطي → خصم وتفعيل فوري، لا يغطي → اشحن من «محفظتي» وأعد المحاولة',
    body: () => (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">💳</span>
        <div className="rounded-xl bg-white p-3 text-[11px] font-bold leading-relaxed text-slate-700 shadow">
          كل ميزة تُخصم من رصيدك لحظة التفعيل وتظهر في سجل محفظتك.
          <span className="mt-1 block text-emerald-700">وإن لم يكفِ رصيدك تظهر لك رسالة برابط «اشحن رصيدك من هنا» — وإعلانك يُنشر على كل حال.</span>
        </div>
      </div>
    ),
  },
];
export function AdBoostTutorial() {
  return <TutorialPlayer slides={AD_BOOST_SLIDES} shareTitle="مميزات تزيد في تسويق إعلانك — عقار تربح" ctaHref="/ads/new" ctaLabel="🚀 أضف إعلانك وميّزه الآن" />;
}
