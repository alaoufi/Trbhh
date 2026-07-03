import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { SITE } from '@/lib/constants';

export const metadata = { title: 'شروط فتح المتجر' };

const SECTIONS: { t: string; items: string[] }[] = [
  {
    t: '١) المسؤولية عن المنتجات',
    items: [
      'صاحب المتجر هو المسؤول الوحيد والكامل عن جميع المنتجات والعروض المعروضة داخل متجره: صحّتها، جودتها، مطابقتها للوصف، وسلامتها.',
      `تتبرأ منصة ${SITE.name} من أي ضرر أو نزاع ينشأ عن منتج أو صفقة بين صاحب المتجر والعميل؛ دور المنصة تنظيمي وعرضي فقط.`,
      'الأسعار والكميات والتوفّر مسؤولية صاحب المتجر، ويلتزم بتحديثها وتصحيح أي خطأ فور اكتشافه.',
    ],
  },
  {
    t: '٢) المحتوى المسموح والممنوع',
    items: [
      'يُمنع عرض أي منتج مخالف للأنظمة السعودية أو للشريعة الإسلامية أو الآداب العامة.',
      'يُمنع منعاً باتاً: المنتجات المقلّدة، المسروقة، المخدرات، الأسلحة غير المرخّصة، المواد الإباحية أو المخلّة، وأي محتوى سياسي أو تحريضي.',
      'يجب أن تكون الصور والأوصاف حقيقية للمنتج المعروض دون تضليل أو مبالغة.',
    ],
  },
  {
    t: '٣) صحّة البيانات',
    items: [
      'يقرّ صاحب المتجر بأن بياناته (الاسم، رقم الهوية، الجوال، البريد، وسائل التواصل) صحيحة ومحدّثة.',
      'تُستخدم بيانات الهوية لأغراض التحقّق والمساءلة لدى الإدارة فقط، ولا تُعرض للعامة.',
      'التلاعب بالبيانات أو انتحال هوية الغير يعرّض المتجر للإيقاف الفوري.',
    ],
  },
  {
    t: '٤) الاعتماد والإشراف',
    items: [
      'يخضع المتجر لموافقة الإدارة قبل ظهوره للعامة، وبعد الاعتماد تُنشر إعلانات المتجر مباشرةً.',
      'يحقّ للإدارة تعديل أو حذف أي منتج مخالف، أو إيقاف/إلغاء المتجر دون إشعار مسبق عند المخالفة.',
      'تكرار المخالفات يؤدي إلى حظر صاحب المتجر نهائياً.',
    ],
  },
  {
    t: '٥) التعامل مع العملاء',
    items: [
      'الالتزام بالتعامل الحسن والرد على استفسارات العملاء بأمانة ووضوح.',
      'الوفاء بما يُعلن عنه من عروض وأسعار ومواعيد.',
      'تُعدّ تقييمات العملاء وملاحظاتهم جزءاً من سجل المتجر ولا يجوز التلاعب بها.',
    ],
  },
];

export default function StoreTermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <div className="card-3d flex items-center gap-3 rounded-2xl p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></span>
        <div>
          <h1 className="text-xl font-extrabold text-primary">شروط وأحكام فتح المتجر</h1>
          <p className="text-sm text-muted-foreground">بموافقتك على فتح المتجر فأنت تقرّ بالالتزام بما يلي وتتحمّل مسؤولية منتجاتك.</p>
        </div>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.t} className="card-3d rounded-2xl p-5">
          <h2 className="mb-2 font-bold text-primary">{s.t}</h2>
          <ul className="space-y-2 text-sm leading-7 text-foreground/90">
            {s.items.map((it, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> {it}</li>)}
          </ul>
        </div>
      ))}

      <div className="card-3d rounded-2xl bg-primary/5 p-5 text-sm font-bold text-primary">
        بالضغط على «أوافق على الشروط» في صفحة إنشاء المتجر، تُعدّ موافقتك موثّقة وملزمة قانونياً.
      </div>

      <Link href="/account/company" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
        <ArrowRight className="h-4 w-4" /> العودة لإنشاء المتجر
      </Link>
    </div>
  );
}
