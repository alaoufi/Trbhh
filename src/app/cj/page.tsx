import Link from 'next/link';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { CJ_CATALOG_TABS, loadCjCatalog, type CjCatalogQuery } from '@/lib/cj/catalog-feed';
import { CjProductCard } from '@/components/cj/product-card';
import { CjApprovedCard } from '@/components/cj/approved-card';
import { AdCardMarketplace } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'كتالوج CJ (إدارة)', robots: { index: false, follow: false } };

export default async function CjStorePage({ searchParams }: { searchParams?: Promise<CjCatalogQuery> } = {}) {
  const view = await cjStorefrontView();
  if (!view.isStaff) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-extrabold text-primary">هذا القسم غير متاح</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-white">العودة للرئيسية</Link></div>;
  const [catalog] = await Promise.all([loadCjCatalog(await searchParams ?? {})]);
  const href = (page: number) => `/cj?tab=${catalog.tab}&page=${page}`;
  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 py-5 sm:px-5" data-cj-trial="catalog">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950"><b>كتالوج CJ — خاص بالإدارة</b> — شراء كامل: تحقّق حيّ من السعر والمخزون والشحن، ثم السلة ← إنشاء الطلب ← الاعتماد والدفع من محفظة CJ ← التتبّع حتى التسليم.</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-primary">السلع والإعلانات</h1><p className="mt-2 text-sm text-slate-500">{catalog.total} نتيجة — الصفحة {catalog.page} من {catalog.pageCount}</p></div></div>
    <nav aria-label="تصنيف الكتالوج" className="flex flex-wrap gap-2">{CJ_CATALOG_TABS.map(tab => <Link key={tab.id} href={`/cj?tab=${tab.id}`} aria-current={catalog.tab === tab.id ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-bold ${catalog.tab === tab.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-primary hover:bg-slate-50'}`}>{tab.label}</Link>)}</nav>
    {catalog.tab === 'verified' && <p className="text-sm leading-7 text-slate-600">إعلانات منشورة لبائعين موثقين في تربح. التوثيق يخص حساب البائع ولا يعني ضمان السلعة.</p>}
    {catalog.tab === 'trbhh' && <p className="text-sm leading-7 text-slate-600">سلع معتمدة صراحةً للبيع باسم تربح؛ إعلانات الأعضاء المدفوعة أو حسابات المشرفين لا تُصنَّف هنا تلقائيًا.</p>}
    {catalog.items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{catalog.items.map(item => item.source === 'cj' ? <CjProductCard key={item.key} product={item.product} /> : item.source === 'commerce' ? <CjApprovedCard key={item.key} product={item.product} /> : <AdCardMarketplace key={item.key} ad={item.ad} />)}</div> : <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">لا توجد نتائج مؤهلة للعرض في هذا التبويب.</p>}
    {catalog.pageCount > 1 && <nav aria-label="صفحات الكتالوج" className="flex flex-wrap items-center justify-center gap-3">{catalog.page > 1 && <Link href={href(catalog.page - 1)} className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-primary">السابق</Link>}<span className="text-sm text-slate-600">{catalog.page} / {catalog.pageCount}</span>{catalog.page < catalog.pageCount && <Link href={href(catalog.page + 1)} className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-primary">التالي</Link>}</nav>}
  </div>;
}
