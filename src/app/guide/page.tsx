import {
  BookOpen, LayoutDashboard, Users, Megaphone, Copy, Sparkles, LayoutGrid, Ban, Flag,
  ShieldCheck, Crown, MonitorPlay, Settings, ArrowUp, Target, ListChecks,
  UserPlus, PlusCircle, MessageCircle, BarChart3, Rocket,
} from 'lucide-react';
import { ScrollTop } from '@/components/scroll-top';

// دليل العضو — خطوات البدء السريعة
const MEMBER: { icon: React.ElementType; title: string; text: string; from: string; to: string }[] = [
  { icon: UserPlus, title: 'أنشئ حسابك', text: 'سجّل برقم جوالك خلال ثوانٍ، وادخل بأمان في أي وقت.', from: '#3287da', to: '#1b4f8a' },
  { icon: PlusCircle, title: 'أضف إعلانك', text: 'اضغط «أضف إعلان»، اكتب التفاصيل والسعر والموقع، وأرفق صوراً واضحة أو فيديو.', from: '#0ea5e9', to: '#0369a1' },
  { icon: Sparkles, title: 'صمّم إعلاناً مبوّباً', text: 'بالمصمم الذكي اصنع بطاقة إعلانية جذّابة تلفت الأنظار بسرعة.', from: '#22c55e', to: '#15803d' },
  { icon: ShieldCheck, title: 'وثّق حسابك', text: 'ارفع وثائقك الرسمية لتحصل على شارة «موثّق» تزيد ثقة العملاء بك.', from: '#10b981', to: '#047857' },
  { icon: MessageCircle, title: 'تواصل واستقبل', text: 'استقبل العملاء عبر الاتصال أو واتساب أو المراسلة داخل المنصة مباشرة.', from: '#a855f7', to: '#7e22ce' },
  { icon: Crown, title: 'ميّز إعلانك', text: 'اشترك بباقة أو خدمة تمييز ليظهر إعلانك بشكل بارز وفي أعلى القوائم.', from: '#eab308', to: '#a16207' },
  { icon: BarChart3, title: 'تابع حسابك', text: 'اطّلع على رسائلك وتقييماتك والبلاغات وردّك عليها، وشاهد تحليلات إعلاناتك.', from: '#f97316', to: '#c2410c' },
];

export const dynamic = 'force-dynamic';
export const metadata = { title: 'دليل الاستخدام' };

type Section = {
  id: string; title: string; icon: React.ElementType; from: string; to: string;
  goal: string; steps: string[];
};

const SECTIONS: Section[] = [
  {
    id: 'dashboard', title: 'لوحة الإدارة', icon: LayoutDashboard, from: '#3287da', to: '#1b4f8a',
    goal: 'نظرة سريعة على حالة الموقع وأهم الأرقام والمهام العاجلة.',
    steps: [
      'تعرض بطاقات بأعداد: الإعلانات، المستخدمين، البلاغات، الإعلانات المكررة، الترويجية بانتظار الموافقة…',
      'اضغط أي بطاقة للانتقال مباشرة إلى قسمها.',
      'تظهر لك فقط الأقسام المصرّح لك بها حسب صلاحيتك.',
    ],
  },
  {
    id: 'users', title: 'المستخدمون والصلاحيات', icon: Users, from: '#6366f1', to: '#3730a3',
    goal: 'إدارة الأعضاء ومنح صلاحيات دقيقة لكل موظف إدارة.',
    steps: [
      'ابحث عن العضو بالاسم أو الجوال.',
      'وثِّق / ألغِ توثيق العضو، أو احظره / ارفع الحظر.',
      'عيّن له باقة اشتراك ومدّتها بالأيام.',
      'اضغط «الصلاحيات» لفتح مصفوفة الصلاحيات: فعّل لكل خدمة (عرض/إضافة/تعديل/حذف/أرشفة) ما يستطيع فعله.',
      'أو استخدم التعيين السريع: مدير / مشرف / مراقب. ملاحظة: الإعلانات لا تتضمّن «تعديل» حفاظاً على خصوصية الأعضاء.',
    ],
  },
  {
    id: 'ads', title: 'الإعلانات', icon: Megaphone, from: '#0ea5e9', to: '#0369a1',
    goal: 'مراجعة إعلانات الأعضاء والتحكم في ظهورها.',
    steps: [
      'استعرض كل الإعلانات أو «بانتظار الموافقة» فقط (عند تفعيل المراجعة).',
      'ميّز الإعلان (مثبّت بالأعلى) أو أوقفه/فعّله، أو احذفه.',
      'داخل صفحة الإعلان: أرشفة أو حذف أو حظر العضو — لا يُسمح بتعديل محتوى إعلان العضو.',
    ],
  },
  {
    id: 'duplicates', title: 'الإعلانات المكررة', icon: Copy, from: '#f59e0b', to: '#b45309',
    goal: 'كشف وإزالة الإعلانات المكررة لنفس العضو.',
    steps: [
      'يعرض النظام مجموعات الإعلانات المتطابقة (عنوان/تفاصيل/صور).',
      'يُبقى دائماً أقدم إعلان في المجموعة.',
      'اضغط «حذف كل المكرر» لإزالة النسخ الزائدة دفعة واحدة.',
    ],
  },
  {
    id: 'classified', title: 'الإعلانات المبوّبة', icon: Sparkles, from: '#22c55e', to: '#15803d',
    goal: 'إدارة بطاقات المصمم الذكي التي يصممها الأعضاء.',
    steps: [
      'استعرض جميع الإعلانات المبوّبة.',
      'احذف أي إعلان مخالف.',
      'تُضبط مدة بقائها ومن يرى إحصائياتها من صفحة «الإعدادات».',
    ],
  },
  {
    id: 'categories', title: 'الأقسام', icon: LayoutGrid, from: '#14b8a6', to: '#0f766e',
    goal: 'تنظيم أقسام الموقع التي تُصنّف تحتها الإعلانات.',
    steps: ['أضف قسماً جديداً بكتابة اسمه.', 'فعّل أو أوقف ظهور أي قسم.'],
  },
  {
    id: 'words', title: 'الكلمات المرفوضة وحارس المحتوى', icon: Ban, from: '#ef4444', to: '#991b1b',
    goal: 'حجب الألفاظ غير اللائقة، ومنع الإعلانات المخالفة تلقائياً.',
    steps: [
      'أضف كلمات تُحجب وتظهر مظللة بالأسود (مطابقة كلمة كاملة).',
      'حارس المحتوى الذكي يفحص كل إعلان ويمنع: السياسي / المخدرات / الأمني / الأخلاقي.',
      'المحتوى غير الأخلاقي يُرفض ويُحظر الحساب فوراً.',
      'من صفحة «كلمات الحارس» يمكنك تعديل قوائم كل فئة.',
    ],
  },
  {
    id: 'reports', title: 'البلاغات', icon: Flag, from: '#f97316', to: '#c2410c',
    goal: 'متابعة بلاغات الأعضاء عن الإعلانات المخالفة.',
    steps: ['استعرض البلاغات وسببها والإعلان المبلّغ عنه.', 'انتقل للإعلان لاتخاذ إجراء (أرشفة/حذف/حظر).'],
  },
  {
    id: 'verifications', title: 'طلبات التوثيق', icon: ShieldCheck, from: '#10b981', to: '#047857',
    goal: 'اعتماد توثيق حسابات الأعضاء الموثوقين.',
    steps: ['استعرض الطلبات المعلّقة.', 'اضغط «توثيق» لاعتماد الحساب فيظهر بشارة موثّق.'],
  },
  {
    id: 'packages', title: 'الباقات', icon: Crown, from: '#eab308', to: '#a16207',
    goal: 'تحديد باقات الأعضاء: عدد الإعلانات، مدة البقاء، والتميّز.',
    steps: [
      'لكل باقة: السعر (0 = مجانية)، عدد الإعلانات/اليوم، الفارق الزمني بالساعات.',
      'مدة بقاء الإعلان بالأيام (الأقل تختفي أسرع)، والترتيب.',
      'نجمة تميّز ذهبية أو فضية تظهر على إعلانات صاحب الباقة.',
      'عدد إعلانات التميّز المثبّتة بالأعلى وعدد أيامها.',
    ],
  },
  {
    id: 'promos', title: 'الإعلانات الترويجية', icon: MonitorPlay, from: '#a855f7', to: '#7e22ce',
    goal: 'إدارة البانرات المدفوعة في أماكن ثابتة بالموقع.',
    steps: [
      'حدّد «باقات المدد والأسعار» (أسبوعان/شهر/ستة أشهر/سنة).',
      'راجع طلبات الأعضاء: وافق وانشر، ارفض، أو احذف.',
      'يبدأ عرض الإعلان من تاريخ الموافقة وينتهي تلقائياً.',
    ],
  },
  {
    id: 'settings', title: 'الإعدادات', icon: Settings, from: '#64748b', to: '#334155',
    goal: 'ضبط سياسات الموقع العامة.',
    steps: [
      'مدة سماح العضو بتعديل/حذف إعلانه (بالساعات).',
      'إظهار/إخفاء إحصائيات الصفحة الرئيسية.',
      'من يرى إحصائيات الإعلانات المبوّبة (الجميع/المالك/الإدارة).',
      'مدة بقاء الإعلان المبوّب بالأيام.',
      'مراجعة الإعلانات قبل النشر (أو النشر الفوري).',
    ],
  },
];

export default async function GuidePage() {
  return (
    <div id="guide-top" className="space-y-5 scroll-mt-20">
      <ScrollTop targetId="guide-top" />
      {/* header */}
      <div className="card-3d overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#1b4f8a] p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20"><BookOpen className="h-7 w-7" /></span>
          <div>
            <h1 className="text-xl font-extrabold">دليل الاستخدام</h1>
            <p className="text-sm font-bold text-white/85">للأعضاء: كيف تبدأ خطوة بخطوة — وللإدارة: شرح كل خدمة.</p>
          </div>
        </div>
      </div>

      {/* دليل العضو — بدء سريع */}
      <section className="card-3d overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 bg-gradient-to-l from-emerald-600 to-teal-700 p-4 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30"><Rocket className="h-6 w-6" /></span>
          <div><h2 className="text-lg font-extrabold drop-shadow">للأعضاء — ابدأ في 7 خطوات</h2><p className="text-xs font-bold text-white/85">كل ما تحتاجه لتنشر وتبيع وتتواصل باحتراف.</p></div>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {MEMBER.map((m, i) => (
            <div key={i} className="card-3d flex items-start gap-3 rounded-xl p-3">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-md" style={{ backgroundImage: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>
                <m.icon className="h-5 w-5" />
                <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-extrabold text-primary shadow ring-1 ring-primary/20">{i + 1}</span>
              </span>
              <div className="min-w-0">
                <div className="font-extrabold text-primary">{m.title}</div>
                <p className="text-sm leading-6 text-foreground/90">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* index / فهرس (لوحة الإدارة) */}
      <div className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-extrabold text-primary">القسم التالي مخصّص للإدارة 👇</div>

      {/* index / فهرس */}
      <div id="guide-index" className="scroll-mt-20 rounded-2xl border-2 border-primary/20 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-extrabold text-primary"><ListChecks className="h-5 w-5" /> الفهرس — اضغط للانتقال</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 rounded-xl border-2 border-primary/15 bg-white px-3 py-2.5 text-sm font-bold text-primary transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}><s.icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{i + 1}. {s.title}</span>
            </a>
          ))}
        </div>
      </div>

      {/* sections */}
      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
          {/* colored 3D header */}
          <div className="flex items-center justify-between gap-3 p-4 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 shadow-inner ring-1 ring-white/30"><s.icon className="h-7 w-7" /></span>
              <h2 className="text-lg font-extrabold drop-shadow">{i + 1}. {s.title}</h2>
            </div>
            <a href="#guide-index" className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30" title="العودة للفهرس">
              <ArrowUp className="h-4 w-4" /> الفهرس
            </a>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div><div className="text-xs font-extrabold text-primary">الهدف</div><p className="text-sm font-bold text-foreground/90">{s.goal}</p></div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary"><ListChecks className="h-4 w-4" /> الإجراء والطريقة</div>
              <ol className="space-y-2">
                {s.steps.map((st, j) => (
                  <li key={j} className="flex items-start gap-2 rounded-lg border border-primary/10 bg-accent/20 p-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-white">{j + 1}</span>
                    <span className="text-sm font-bold text-foreground/90">{st}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
