import {
  Building2, ShieldCheck, FileText, HelpCircle, Phone, MessageCircle, Send,
  Database, Lock, UserCog, Cookie, CheckCircle2, AlertTriangle, Ban, Scale, Sparkles, Clock,
  Search, BarChart3, Megaphone, Handshake,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE, DISCLAIMER } from '@/lib/constants';
import { FaqAccordion, type QA } from '@/components/faq-accordion';
import { Breadcrumb } from '@/components/breadcrumb';

const waPhone = SITE.phone.replace(/\D/g, '').replace(/^00/, ''); // 966XXXXXXXXX
const telPhone = '+' + waPhone;

type Section = { icon: React.ElementType; title: string; text: string };

const HERO: Record<string, { icon: React.ElementType; title: string; subtitle: string; grad: [string, string] }> = {
  about: { icon: Building2, title: 'من نحن', subtitle: `تعرّف على منصة ${SITE.name}`, grad: ['#3287da', '#1b4f8a'] },
  faq: { icon: HelpCircle, title: 'الأسئلة الشائعة', subtitle: 'إجابات سريعة لأكثر ما يُسأل', grad: ['#0284c7', '#4338ca'] },
  privacy: { icon: ShieldCheck, title: 'سياسة الخصوصية', subtitle: 'كيف نحمي بياناتك ونحترم خصوصيتك', grad: ['#059669', '#0f766e'] },
  terms: { icon: FileText, title: 'الشروط والأحكام', subtitle: 'قواعد استخدام المنصة', grad: ['#d97706', '#c2410c'] },
  contact: { icon: Phone, title: 'تواصل معنا', subtitle: 'نحن هنا لخدمتك في أي وقت', grad: ['#c026d3', '#1b4f8a'] },
};

const FAQ: QA[] = [
  { q: 'كيف أضيف إعلاناً؟', a: 'سجّل الدخول ثم اضغط «أضف إعلان»، املأ العنوان والتفاصيل والسعر والقسم والموقع، وأرفق صوراً واضحة (ويمكنك إضافة فيديو أو تسجيل صوتي)، ثم انشر.' },
  { q: 'كيف أعدّل أو أحذف إعلاني؟', a: 'من «حسابي ← إعلاناتي» تجد أزرار التعديل والحذف. يُسمح بالتعديل والحذف خلال المدة التي تحددها الإدارة بعد النشر.' },
  { q: 'لماذا يظهر إعلاني «بانتظار الموافقة»؟', a: 'عند تفعيل خيار مراجعة الإعلانات، يبقى الإعلان الجديد محجوباً حتى تعتمده الإدارة للتأكد من مطابقته للشروط، ثم يُنشر مباشرة.' },
  { q: 'ما الفرق بين الإعلان العادي والمبوّب (المصمم الذكي)؟', a: 'الإعلان العادي إعلان تفصيلي بصور ومواصفات. أما المبوّب فبطاقة تصميمية جذّابة تصنعها بالمصمم الذكي لعرض سريع ولافت.' },
  { q: 'كيف أرفع إعلاني للأعلى؟', a: 'عبر الباقات وخدمات التمييز يظهر إعلانك بشكل بارز وفي أعلى القوائم. طالع صفحة «الباقات» و«أعلن معنا».' },
  { q: 'كيف أوثّق حسابي؟', a: 'من لوحة حسابك اختر «توثيق الحساب» وارفع وثائقك الرسمية (السجل/الهوية) لمراجعتها من الإدارة، فتحصل على شارة موثّق تزيد ثقة العملاء.' },
  { q: 'كيف أتواصل مع صاحب الإعلان؟', a: 'من صفحة الإعلان استخدم أزرار الاتصال أو واتساب، أو زر «مراسلة» للدردشة داخل المنصة مباشرةً مع المعلن.' },
  { q: 'هل تتم عمليات الدفع عبر المنصة؟', a: 'لا. جميع الاتفاقيات والمدفوعات تتم مباشرةً بين الطرفين خارج المنصة. تأكّد من الطرف الآخر قبل أي تحويل، ودورنا تسهيل التواصل فقط.' },
  { q: 'نسيت كلمة المرور، ماذا أفعل؟', a: 'من صفحة الدخول اضغط «نسيت كلمة المرور» وأدخل رقم جوالك المسجّل ليصلك رمز إعادة التعيين عبر رسالة نصية.' },
  { q: 'كيف أبلّغ عن إعلان مخالف؟', a: 'من صفحة الإعلان اضغط «إبلاغ» واختر السبب. تصل البلاغات للإدارة فوراً وتُتّخذ الإجراءات، وهوية المُبلِّغ تبقى سرّية.' },
  { q: 'كيف أراسل الإدارة؟', a: 'من القائمة اختر «مراسلات الإدارة» ثم «مراسلة الإدارة» لبدء محادثة، وسيصلك ردّ فوري ثم يتابع الفريق طلبك.' },
];

const PRIVACY: Section[] = [
  { icon: Database, title: 'البيانات التي نجمعها', text: 'نجمع الحد الأدنى اللازم لتشغيل المنصة: الاسم، رقم الجوال، البريد إن وُجد، ومحتوى إعلاناتك، إضافة إلى بيانات فنية بسيطة لتحسين الخدمة.' },
  { icon: UserCog, title: 'كيف نستخدم بياناتك', text: 'تُستخدم بياناتك لعرض إعلاناتك، وتسهيل تواصل العملاء معك، وحماية المنصة من إساءة الاستخدام. لا نستخدمها لأغراض خارج هذا النطاق.' },
  { icon: Lock, title: 'حماية البيانات', text: 'نتّخذ إجراءات تقنية وتنظيمية لحماية بياناتك، ولا نشاركها مع أي طرف ثالث لأغراض تسويقية دون موافقتك الصريحة.' },
  { icon: Cookie, title: 'ملفات الارتباط', text: 'نستخدم ملفات ارتباط أساسية لإبقائك مسجّل الدخول وتذكّر تفضيلاتك، وقد نستخدم ملفات ارتباط إعلانية من منصات موثوقة (مثل Meta وGoogle وTikTok وSnapchat) لقياس أداء إعلاناتنا والوصول لجمهور مشابه لزوّار المنصة. يمكنك التحكم بكل ذلك من إعدادات متصفحك.' },
  { icon: UserCog, title: 'حقوقك', text: 'يمكنك تعديل أو حذف بياناتك في أي وقت من إعدادات حسابك أو بالتواصل معنا، ولك حق الاستفسار عمّا نحتفظ به عنك.' },
];

const TERMS: Section[] = [
  { icon: CheckCircle2, title: 'قبول الشروط', text: 'باستخدامك المنصة فإنك توافق على هذه الشروط، وعلى نشر محتوى صحيح وغير مخالف للأنظمة المعمول بها في المملكة.' },
  { icon: AlertTriangle, title: 'مسؤولية المحتوى', text: 'أنت المسؤول الكامل عن محتوى إعلاناتك وصحّة بياناتها ووسائل التواصل، وتتحمّل نتائج أي اتفاق يتم عبرها.' },
  { icon: Ban, title: 'المحتوى الممنوع', text: 'يُمنع منعاً باتاً نشر المحتوى المضلّل أو الاحتيالي أو المكرر أو غير الأخلاقي أو الأمني أو السياسي المخالف أو أي محتوى ضد الأنظمة.' },
  { icon: Scale, title: 'حقوق الإدارة', text: 'يحق للإدارة تعديل أو إيقاف أو حذف أي إعلان أو حساب مخالف دون إشعار مسبق، حفاظاً على سلامة المجتمع وموثوقية المنصة.' },
  { icon: FileText, title: 'التعديلات على الشروط', text: 'قد نُحدّث هذه الشروط من وقت لآخر، ويسري التحديث فور نشره على المنصة، واستمرارك في الاستخدام يعني موافقتك عليه.' },
];

const ABOUT: Section[] = [
  { icon: Building2, title: `منصة ${SITE.name}`, text: `${SITE.name} منصة إعلانات مبوّبة متخصصة في ربط الشركات والمؤسسات والموردين ومقدّمي الخدمات وأصحاب المعدات والآليات بالعملاء الباحثين عنها.` },
  { icon: Sparkles, title: 'دورنا', text: 'نعرض الإعلانات ونسهّل التواصل المباشر بين الأطراف، ونوثّق بيانات المعلنين، ونوفّر بيئة موثوقة وآمنة بأدوات حماية ذكية ضد المحتوى المخالف.' },
  { icon: ShieldCheck, title: 'التزامنا', text: DISCLAIMER.long },
];

const SECTIONS: Record<string, Section[]> = { about: ABOUT, privacy: PRIVACY, terms: TERMS };
const VALID = ['about', 'faq', 'privacy', 'terms', 'contact'];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: HERO[slug]?.title ?? 'صفحة' };
}

export function generateStaticParams() {
  return VALID.map((slug) => ({ slug }));
}

function Hero({ slug }: { slug: string }) {
  const h = HERO[slug];
  return (
    <div className="card-3d relative overflow-hidden rounded-2xl p-6 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${h.grad[0]}, ${h.grad[1]})` }}>
      <div className="relative z-10 flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 backdrop-blur"><h.icon className="h-7 w-7" /></span>
        <div>
          <h1 className="text-2xl font-extrabold drop-shadow">{h.title}</h1>
          <p className="text-sm text-white/90">{h.subtitle}</p>
        </div>
      </div>
      <span className="pointer-events-none absolute -left-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-8 left-16 h-24 w-24 rounded-full bg-white/10" />
    </div>
  );
}

function AboutExtras() {
  const features = [
    { icon: ShieldCheck, title: 'ثقة وأمان', text: 'توثيق للحسابات وحماية ذكية ضد المحتوى المخالف.' },
    { icon: MessageCircle, title: 'تواصل مباشر', text: 'اتصال وواتساب ومراسلة داخل المنصة بين الطرفين.' },
    { icon: Search, title: 'وصول أوسع', text: 'تصنيفات ومدن وبحث متقدّم يوصل إعلانك للمهتمّين.' },
    { icon: BarChart3, title: 'أدوات احترافية', text: 'تحليلات لإعلاناتك وباقات تميّز ترفعها للأعلى.' },
  ];
  const steps = [
    { icon: Megaphone, title: 'انشر إعلانك', text: 'أضف تفاصيلك وصورك في دقائق.' },
    { icon: Search, title: 'يصلك العملاء', text: 'يظهر إعلانك للباحثين عن خدمتك.' },
    { icon: Handshake, title: 'تتّفقون مباشرة', text: 'تتواصلون وتُتمّون الصفقة بينكم.' },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {features.map((f, i) => (
          <div key={i} className="card-3d flex flex-col items-center gap-2 rounded-2xl p-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><f.icon className="h-6 w-6" /></span>
            <span className="font-extrabold text-primary">{f.title}</span>
            <span className="text-xs leading-6 text-muted-foreground">{f.text}</span>
          </div>
        ))}
      </div>
      <div className="card-3d rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 font-extrabold text-primary"><Sparkles className="h-5 w-5" /> كيف تعمل المنصة؟</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="relative rounded-xl border-2 border-primary/15 bg-accent/20 p-3 text-center">
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-extrabold text-white">{i + 1}</span>
              <s.icon className="mx-auto mb-1 h-7 w-7 text-primary" />
              <div className="font-extrabold text-primary">{s.title}</div>
              <p className="text-xs leading-6 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ContactCards() {
  const cards = [
    { icon: Phone, label: 'اتصال هاتفي', sub: telPhone, href: `tel:${telPhone}`, cls: 'bg-red-600' },
    { icon: MessageCircle, label: 'واتساب', sub: 'محادثة مباشرة', href: `https://wa.me/${waPhone}`, cls: 'bg-[#25D366]' },
    { icon: Send, label: 'مراسلة الإدارة', sub: 'دردشة داخل المنصة', href: '/messages/admin', cls: 'bg-primary' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <a key={c.label} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
          className="card-3d flex flex-col items-center gap-2 rounded-2xl p-5 text-center transition hover:-translate-y-1">
          <span className={`grid h-14 w-14 place-items-center rounded-2xl text-white ${c.cls}`}><c.icon className="h-7 w-7" /></span>
          <span className="font-extrabold text-primary">{c.label}</span>
          <span className="text-xs text-muted-foreground" dir="ltr">{c.sub}</span>
        </a>
      ))}
    </div>
  );
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!VALID.includes(slug)) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Breadcrumb items={[{ label: HERO[slug].title }]} />
      <Hero slug={slug} />

      {slug === 'privacy' && (
        <Link href="/delete-account" className="card-3d flex items-center justify-between gap-3 rounded-2xl border-2 border-red-200 p-4 transition hover:-translate-y-0.5">
          <span>
            <span className="block font-bold text-red-700">حذف الحساب والبيانات / Account &amp; Data Deletion</span>
            <span className="block text-xs text-muted-foreground">يمكنك حذف حسابك وكامل بياناتك في أي وقت — بنفسك فوراً أو بطلب للإدارة.</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-red-700">افتح ←</span>
        </Link>
      )}
      {slug === 'faq' && <FaqAccordion items={FAQ} />}

      {slug === 'about' && <AboutExtras />}

      {slug === 'contact' && (
        <>
          <ContactCards />
          <div className="card-3d flex items-center gap-3 rounded-2xl p-4">
            <Clock className="h-6 w-6 shrink-0 text-primary" />
            <p className="text-sm text-foreground/90">فريق الدعم متواجد لخدمتك. راسلنا في أي وقت وسنردّ في أقرب فرصة.</p>
          </div>
        </>
      )}

      {SECTIONS[slug]?.map((s, i) => (
        <div key={i} className="card-3d flex items-start gap-3 rounded-2xl p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><s.icon className="h-5 w-5" /></span>
          <div>
            <h2 className="mb-1 font-extrabold text-primary">{s.title}</h2>
            <p className="leading-8 text-foreground/90">{s.text}</p>
          </div>
        </div>
      ))}

    </div>
  );
}
