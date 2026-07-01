import { notFound } from 'next/navigation';
import { SITE, DISCLAIMER } from '@/lib/constants';
import { DisclaimerBar } from '@/components/disclaimer';

type Page = { title: string; body: string[] };

const PAGES: Record<string, Page> = {
  about: {
    title: 'من نحن',
    body: [
      `${SITE.name} منصة إعلانات مبوّبة متخصصة في ربط الشركات والمؤسسات والموردين ومقدّمي الخدمات وأصحاب المعدات والآليات بالعملاء الباحثين عنها.`,
      'دورنا يقتصر على عرض الإعلانات وتسهيل التواصل المباشر بين الأطراف وتوثيق بيانات المعلنين وتوفير بيئة موثوقة وآمنة.',
      DISCLAIMER.long,
    ],
  },
  privacy: {
    title: 'سياسة الخصوصية',
    body: [
      'نحرص على حماية خصوصية مستخدمينا. نجمع الحد الأدنى من البيانات اللازمة لتشغيل المنصة مثل الاسم ورقم الجوال ومحتوى الإعلانات.',
      'لا نشارك بياناتك مع أطراف ثالثة لأغراض تسويقية دون موافقتك. تُستخدم بياناتك لعرض إعلاناتك وتسهيل تواصل العملاء معك.',
      'يمكنك طلب تعديل أو حذف بياناتك في أي وقت من خلال إعدادات حسابك أو بالتواصل معنا.',
    ],
  },
  terms: {
    title: 'شروط الاستخدام',
    body: [
      'باستخدامك المنصة فإنك توافق على نشر محتوى صحيح وغير مخالف للأنظمة، وتتحمّل كامل المسؤولية عن إعلاناتك.',
      'يُمنع نشر المحتوى المضلّل أو الاحتيالي أو المكرر أو المخالف للذوق العام، وللإدارة الحق في إيقاف أي إعلان أو حساب مخالف.',
      DISCLAIMER.long,
    ],
  },
  faq: {
    title: 'الأسئلة الشائعة',
    body: [
      'كيف أضيف إعلاناً؟ سجّل الدخول ثم اضغط «أضف إعلان» واملأ البيانات وأرفق الصور.',
      'كيف أوثّق حسابي؟ من لوحة حسابك اختر «توثيق الحساب» وارفع وثائقك الرسمية لمراجعتها من الإدارة.',
      'هل تتم عمليات الدفع عبر المنصة؟ لا. جميع الاتفاقيات والمدفوعات تتم خارج المنصة مباشرة بين الطرفين.',
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: PAGES[slug]?.title ?? 'صفحة' };
}

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{page.title}</h1>
      <div className="space-y-3 rounded-xl border bg-card p-5 leading-8 shadow-sm">
        {page.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {slug !== 'privacy' && <DisclaimerBar />}
    </div>
  );
}
