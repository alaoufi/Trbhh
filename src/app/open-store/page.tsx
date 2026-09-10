import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Store } from 'lucide-react';
import { getAuditUxSettings, getStoreSubPricing } from '@/lib/settings';
import { SITE } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'افتح متجرك — المزايا والأسعار' };

export default async function OpenStorePage() {
  const [ux, pricing] = await Promise.all([getAuditUxSettings(), getStoreSubPricing()]);
  if (!ux.flags.store_landing_on) redirect('/store');
  const plans = [['شهري', pricing.monthly], ['6 أشهر', pricing.sixmo], ['سنوي', pricing.yearly]] as const;
  return <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
    <section className="rounded-2xl bg-[#142b45] p-6 text-white sm:p-10">
      <Store className="mb-4 h-9 w-9 text-[#e9bd62]" />
      <h1 className="text-2xl font-extrabold sm:text-3xl">{ux.texts.store_landing_title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-200">{ux.texts.store_landing_intro}</p>
      <Link href="/store" className="mt-6 inline-flex rounded-lg bg-[#e9bd62] px-5 py-3 font-bold text-[#142b45]">{ux.texts.store_landing_cta}</Link>
    </section>
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4"><h2 className="text-xl font-bold">ما الذي تحصل عليه؟</h2>
        <ul className="space-y-3">{ux.texts.store_landing_features.split('\n').filter(Boolean).slice(0, 12).map((line, index) => <li key={index} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{line}</span></li>)}</ul>
        <Link href="/guide/store" className="inline-block text-sm font-bold text-primary underline">اطّلع على دليل المتجر</Link>
      </section>
      <section aria-label="مثال توضيحي للمتجر" className="overflow-hidden rounded-xl border bg-card">
        <div className="bg-[#142b45] p-5 text-white"><p className="text-xs text-slate-200">مثال توضيحي</p><h2 className="mt-2 text-lg font-bold">اسم متجرك</h2><p className="mt-1 text-sm">منتجاتك وخدماتك بهويتك</p></div>
        <div className="space-y-3 p-5"><p dir="ltr" className="break-all text-sm text-muted-foreground">{SITE.domain}/companies/your-store</p><div className="grid grid-cols-2 gap-3">{['منتج من متجرك', 'خدمة تقدمها'].map(title => <div key={title} className="rounded-lg border p-4"><Store className="mb-3 h-8 w-8 text-primary" /><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs text-muted-foreground">الصورة والسعر والتفاصيل</p></div>)}</div></div>
      </section>
    </div>
    <section className="space-y-4 rounded-xl border bg-card p-5"><h2 className="text-xl font-bold">التجربة والاشتراك</h2>
      {pricing.enabled ? <>
        {pricing.trialDays > 0 ? <p>تجربة مجانية لمدة <strong>{pricing.trialDays} أيام</strong> تبدأ عند إنشاء المتجر. بعد التجربة يلزم اشتراك للاستمرار وفق سياسة المنصة.</p> : <p>لا توجد فترة تجريبية مجانية حالياً.</p>}
        <div className="grid gap-3 sm:grid-cols-3">{plans.map(([label, price]) => <div key={label} className="rounded-lg border p-4"><h3 className="font-bold">{label}</h3><p className="mt-2">{price > 0 ? <><strong>{price.toLocaleString('ar-SA')}</strong> ر.س</> : 'مجاناً وفق الإعدادات الحالية'}</p></div>)}</div>
      </> : <p>اشتراك المتجر غير مطلوب حالياً وفق إعدادات المنصة.</p>}
      <p className="text-sm leading-6 text-muted-foreground">هذه أسعار الاشتراك الحالية. التمييز والظهور المدفوع في تربح خدمات إضافية بأسعارها المستقلة. المتجر يخضع لاعتماد الإدارة قبل ظهوره للعملاء.</p>
      <div className="flex flex-wrap items-center gap-4"><Link href="/store" className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground">{ux.texts.store_landing_cta}</Link><Link href="/store-terms" className="text-sm underline">شروط المتجر وسياسة الخصوصية</Link></div>
    </section>
  </div>;
}
