import Link from 'next/link';
import { catalogStores } from '@/lib/cj/catalog-stores';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { CJ_CATALOG_TABS, loadCjCatalog, type CjCatalogQuery } from '@/lib/cj/catalog-feed';
import { getCategories } from '@/lib/data';
import { CjProductCard } from '@/components/cj/product-card';
import { CjApprovedCard } from '@/components/cj/approved-card';
import { AdCardMarketplace } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'منتجات تربح', robots: { index: false, follow: false } };

export default async function CjStorePage({ searchParams }: { searchParams?: Promise<CjCatalogQuery> } = {}) {
  const view = await cjStorefrontView();
  if (!view.isStaff) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-extrabold text-primary">هذا القسم غير متاح</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-white">العودة للرئيسية</Link></div>;
  const [catalog, categories, stores] = await Promise.all([loadCjCatalog(await searchParams ?? {}), getCategories(), catalogStores()]);
  const qParam = catalog.q ? `&q=${encodeURIComponent(catalog.q)}` : '';
  const catParam = catalog.cat ? `&cat=${catalog.cat}` : '';
  const storeParam = catalog.store ? `&store=${catalog.store}` : '';
  const href = (page: number) => `/cj?tab=${catalog.tab}&page=${page}${qParam}${catParam}${storeParam}`;
  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 py-5 sm:px-5" data-cj-trial="catalog">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950"><b>قسم خاص بالإدارة (تجربة)</b> — تحقّق حيّ من السعر والمخزون والشحن، ثم السلة ← إنشاء الطلب ← الاعتماد والدفع من المحفظة ← المتابعة حتى التسليم.</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-primary">منتجات تربح</h1><p className="mt-2 text-sm text-slate-500">{catalog.total} منتج — الصفحة {catalog.page} من {catalog.pageCount}</p></div></div>
    {/* بحث سريع بالاسم العربي (يتجاهل الهمزات وة/ه) يحافظ على التبويب والقسم الحاليَّين. */}
    <form method="get" action="/cj" role="search" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={catalog.tab} />
      {catalog.store ? <input type="hidden" name="store" value={catalog.store} /> : null}
      {catalog.cat ? <input type="hidden" name="cat" value={catalog.cat} /> : null}
      <input name="q" defaultValue={catalog.q} placeholder="ابحث عن منتج…" aria-label="ابحث عن منتج" className="min-h-11 w-full rounded-xl border border-primary/25 bg-white px-4 text-sm" />
      <button type="submit" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white">بحث</button>
      {catalog.q && <Link href={`/cj?tab=${catalog.tab}${catParam}${storeParam}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 px-4 text-sm font-bold text-primary">مسح</Link>}
    </form>
    {/* تصفية بالقسم الموحّد (نفس أقسام إعلانات تربح). */}
    {(categories.length > 0 || stores.length > 0) && <form method="get" action="/cj" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value={catalog.tab} />
      {catalog.q ? <input type="hidden" name="q" value={catalog.q} /> : null}
      <label className="text-sm font-bold text-primary">القسم:</label>
      <select name="cat" defaultValue={catalog.cat || ''} className="min-h-11 rounded-xl border border-primary/25 bg-white px-3 text-sm">
        <option value="">كل الأقسام</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label htmlFor="catalog-store" className="text-sm font-bold text-primary">المتجر:</label>
      <select id="catalog-store" name="store" defaultValue={catalog.store || ''} className="min-h-11 rounded-xl border border-primary/25 bg-white px-3 text-sm">
        <option value="">كل المتاجر</option>
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
      <button type="submit" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white">تصفية</button>
      {catalog.cat || catalog.store ? <Link href={`/cj?tab=${catalog.tab}${qParam}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 px-4 text-sm font-bold text-primary">إلغاء التصفية</Link> : null}
    </form>}
    {catalog.store ? <p className="text-sm text-slate-500">سلع المتجر المرتبطة بإعلاناته المنشورة.</p> : null}
    {catalog.q && <p className="text-sm text-slate-500">نتائج البحث عن «{catalog.q}»: {catalog.total}</p>}
    <nav aria-label="تصنيف الكتالوج" className="flex flex-wrap gap-2">{CJ_CATALOG_TABS.map(tab => <Link key={tab.id} href={`/cj?tab=${tab.id}${qParam}${catParam}${storeParam}`} aria-current={catalog.tab === tab.id ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-bold ${catalog.tab === tab.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-primary hover:bg-slate-50'}`}>{tab.label}</Link>)}</nav>
    {catalog.tab === 'verified' && <p className="text-sm leading-7 text-slate-600">إعلانات منشورة لبائعين موثقين في تربح. التوثيق يخص حساب البائع ولا يعني ضمان السلعة.</p>}
    {catalog.tab === 'trbhh' && <p className="text-sm leading-7 text-slate-600">سلع معتمدة صراحةً للبيع باسم تربح؛ إعلانات الأعضاء المدفوعة أو حسابات المشرفين لا تُصنَّف هنا تلقائيًا.</p>}
    {catalog.items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{catalog.items.map(item => item.source === 'cj' ? <CjProductCard key={item.key} product={item.product} /> : item.source === 'commerce' ? <CjApprovedCard key={item.key} product={item.product} /> : <AdCardMarketplace key={item.key} ad={item.ad} />)}</div> : <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">لا توجد نتائج مؤهلة للعرض في هذا التبويب.</p>}
    {catalog.pageCount > 1 && <nav aria-label="صفحات الكتالوج" className="flex flex-wrap items-center justify-center gap-3">{catalog.page > 1 && <Link href={href(catalog.page - 1)} className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-primary">السابق</Link>}<span className="text-sm text-slate-600">{catalog.page} / {catalog.pageCount}</span>{catalog.page < catalog.pageCount && <Link href={href(catalog.page + 1)} className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-primary">التالي</Link>}</nav>}
  </div>;
}
