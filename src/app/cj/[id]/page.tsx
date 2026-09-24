import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone, MessageCircle, Package, Truck } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { cjProductCapabilities } from '@/lib/cj/access';
import { getAgent, agentContactLinks } from '@/lib/cj/agents';
import { cjProductOrderCount, getStorefrontCjProduct, listStorefrontCjProducts, parseCjAvailability, parseCjDetails } from '@/lib/cj/mapping';
import { saveCjStorefrontEdit, hideCjStorefront, deleteCjStorefront } from '../../admin/suppliers/cj/actions';
import { cjStorefrontView, cjImg, cjProductImages } from '@/lib/cj/storefront';
import { cjPriceLabel } from '@/lib/cj/presentation';
import { CjProductGallery } from '@/components/cj/product-gallery';
import { CjProductDescription } from '@/components/cj/product-description';
import { CjProductCard } from '@/components/cj/product-card';
import { AddToTrialCart, CartLink } from '@/components/cj/cart-controls';
import { PriceText } from '@/components/price-text';

const editInput = 'mt-1 w-full min-w-0 rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة — تجربة CJ', robots: { index: false, follow: false } };

export default async function CjStoreProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await cjStorefrontView();
  // This iteration is an explicitly private CJ trial, even if the old public flag changes.
  if (!view.isStaff) notFound();
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const p = await getStorefrontCjProduct(id, !view.isStaff);
  if (!p) notFound();
  const session = await getSession();
  const capabilities = session ? await cjProductCapabilities(session.uid, p.agent_user_id) : { agent: false, edit: false, suspend: false, delete: false };
  const canManage = capabilities.edit || capabilities.suspend || capabilities.delete;
  const hasActivity = capabilities.delete ? (await cjProductOrderCount(p.cj_product_id)) > 0 : false;
  const productAgent = p.agent_user_id != null ? await getAgent(p.agent_user_id) : null;
  const agentContact = productAgent?.active === 1 ? agentContactLinks(productAgent) : null;
  const title = p.name_ar || 'منتج بانتظار ترجمة الاسم';
  const priceLabel = cjPriceLabel(p.sale_price_override_minor ?? p.sale_price_minor, p.currency);
  const gallery = cjProductImages(p).map(cjImg);
  const details = parseCjDetails(p);
  const availability = parseCjAvailability(p);
  const hasSaudiFreightProof = Boolean(availability?.shippingOptions.some(option => option.name.trim() && Number.isFinite(option.priceUsd) && option.priceUsd >= 0));
  const verifiedStocks = new Map((availability?.variants ?? []).map(variant => [variant.vid, variant.stockQuantity]));
  const selectableVariants = (details?.variants ?? []).flatMap(variant => {
    const stock = verifiedStocks.get(variant.vid);
    const validPrice = typeof variant.priceUsd === 'number' && Number.isFinite(variant.priceUsd) && variant.priceUsd > 0;
    return hasSaudiFreightProof && /^[A-Za-z0-9_-]{1,64}$/.test(variant.vid) && stock && stock > 0 && validPrice
      ? [{ vid: variant.vid, name: variant.name, optionKey: variant.optionKey, sku: variant.sku, stock }]
      : [];
  });
  const variantCount = selectableVariants.length || null;
  const weightMin = details?.weightMin;
  const weightMax = details?.weightMax;
  const weightLabel = typeof weightMin === 'number' && Number.isFinite(weightMin) && weightMin > 0
    ? `${weightMin}${typeof weightMax === 'number' && Number.isFinite(weightMax) && weightMax > weightMin ? `–${weightMax}` : ''} غ` : 'غير محدد';
  const others = (await listStorefrontCjProducts(!view.isStaff, 24)).filter(row => Number(row.id) !== id).slice(0, 6);

  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 py-5 sm:px-5 [overflow-wrap:anywhere]" data-cj-trial="product">
    {view.isStaff && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><b>تجربة CJ الخاصة</b> — تجميع السلع فقط؛ الشراء والدفع غير مفعّلين.</p>{session && <CartLink accountId={session.uid} />}</div>}
    {sp.edited === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">تم حفظ تعديل السلعة.</p>}
    {sp.err === 'has_activity' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">تعذّر الحذف لوجود نشاط على السلعة. يمكنك إخفاؤها.</p>}
    <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/cj" className="font-bold text-primary hover:underline">سلع CJ التجريبية</Link><span aria-hidden="true">/</span><span>تفاصيل المنتج</span></nav>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <CjProductGallery key={id} images={gallery} title={title} />
      <section aria-label="معلومات المنتج" className="min-w-0 space-y-4">
        {p.trbhh_category && <p className="text-xs leading-6 text-slate-500">{p.trbhh_category}</p>}
        <h1 className="text-xl font-extrabold leading-8 text-primary sm:text-2xl">{title}</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p><PriceText size="detail">{priceLabel}</PriceText></p>
          <p className="mt-2 text-xs leading-6 text-slate-500">سعر معروض للتجربة. لا يُنشئ طلبًا ولا يحجز مخزونًا.</p>
        </div>
        {variantCount && <section aria-label="خيارات المنتج" className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-extrabold text-primary">الخيارات المتاحة والمتحقق منها ({variantCount})</h2><p className="mt-1 text-xs leading-6 text-slate-600">تظهر هنا الخيارات التي ثبت لها مخزون وشحن فقط.</p><ul className="mt-3 space-y-2">{selectableVariants.map((variant,index)=><li key={variant.vid} className="min-w-0 rounded-xl bg-slate-50 p-3 text-sm leading-6"><p className="font-bold text-slate-900">{variant.optionKey||variant.name||variant.sku||`الخيار ${index+1}`}</p><div className="flex flex-wrap gap-x-4 text-slate-600">{variant.sku&&<span>SKU: <b dir="ltr">{variant.sku}</b></span>}<span className="font-bold text-emerald-800">المتاح الموثق: {variant.stock}</span></div></li>)}</ul></section>}
        {!variantCount && (details?.variants.length ?? 0) > 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">لا توجد خيارات متاحة ومتحقق منها حاليًا؛ أخفينا الخيارات غير المؤكدة ومنعنا إضافتها للسلة التجريبية.</p>}
        {view.isStaff && session && variantCount && <AddToTrialCart productId={id} accountId={session.uid} variants={selectableVariants} requiresVariant />}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-start gap-3"><Package className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">المخزون يحتاج التحقق</p><p className="mt-1 text-xs leading-6 text-slate-500">لا تتوفر كمية مخزون مؤكدة في بيانات العرض المحفوظة.</p></div></div>
          <div className="flex items-start gap-3"><Truck className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">الشحن والضريبة</p><p className="mt-1 text-xs leading-6 text-slate-500">السعر المحسوب يتضمن تقدير الشحن المسجل؛ لا يضاف مرة ثانية في السلة. تكلفة الشحن النهائية والضريبة وموعد الوصول غير مؤكدة في التجربة.</p></div></div>
        </div>
        {agentContact && (agentContact.wa || agentContact.tel) && <section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">التواصل مع وكيل السلعة</h2><div className="flex flex-wrap gap-2">{agentContact.wa && <a href={agentContact.wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />واتساب</a>}{agentContact.tel && <a href={agentContact.tel} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold text-primary"><Phone className="h-4 w-4" />اتصال</a>}</div></section>}
      </section>
    </div>
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cj-specs"><h2 id="cj-specs" className="mb-3 text-lg font-extrabold text-primary">المواصفات</h2><dl className="divide-y divide-slate-100 text-sm">{[['التصنيف', p.trbhh_category || 'غير محدد'], ['رمز المنتج SKU', p.cj_sku || 'غير محدد'], ['الوزن المسجل', weightLabel], ['عدد الخيارات', variantCount ? String(variantCount) : 'غير محدد']].map(([label, value]) => <div key={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-3"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 font-semibold" dir="auto">{value}</dd></div>)}</dl></section>
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cj-description"><h2 id="cj-description" className="mb-3 text-lg font-extrabold text-primary">تفاصيل المنتج</h2><CjProductDescription text={p.display_description_ar || ''} /></section>
    {canManage && <section aria-labelledby="cj-product-management" className="min-w-0 rounded-2xl border border-primary/20 bg-slate-50 p-4"><h2 id="cj-product-management" className="text-sm font-bold text-primary">إدارة السلعة</h2><div className="mt-4">
      {canManage && (
        <div className="card-3d rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-primary">إدارة السلعة{capabilities.agent ? ' (وكيلها)' : ''}:</span>
            {/* إخفاء/إظهار */}
            {capabilities.suspend && <form action={hideCjStorefront}><input type="hidden" name="id" value={id} /><input type="hidden" name="hidden" value={p.hidden ? '0' : '1'} /><button className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">{p.hidden ? 'إظهار' : 'إخفاء'}</button></form>}
            {/* حذف — فقط إن لا نشاط */}
            {capabilities.delete && (hasActivity
              ? <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">الحذف متعذّر (يوجد نشاط) — الإخفاء متاح</span>
              : <form action={deleteCjStorefront}><input type="hidden" name="id" value={id} /><button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700">حذف</button></form>)}
          </div>
          {capabilities.edit && <div>
            <h3 className="text-sm font-bold text-primary">✎ تعديل مباشر</h3>
            <form action={saveCjStorefrontEdit} className="mt-2 space-y-2 text-sm">
              <input type="hidden" name="id" value={id} />
              <label className="block">العنوان العربي<input name="nameAr" defaultValue={p.name_ar} className={editInput} placeholder="مثال: ساعة يد رجالية" /></label>
              <label className="block">الوصف العربي<textarea name="descriptionAr" rows={4} defaultValue={p.display_description_ar ?? ''} className={editInput} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">التصنيف<input name="trbhhCategory" defaultValue={p.trbhh_category} className={editInput} /></label>
                <label className="block">السعر (ر.س) — فارغ = المحسوب<input name="priceSar" inputMode="decimal" defaultValue={p.sale_price_override_minor != null ? (p.sale_price_override_minor / 100).toString() : ''} placeholder={(p.sale_price_minor / 100).toString()} className={editInput} /></label>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white">حفظ التعديل</button>
                <span className="text-xs text-muted-foreground">تصحيح العنوان/الوصف يُحفظ في ذاكرة الترجمة ويُطبَّق على السلع المشابهة.</span>
              </div>
            </form>
          </div>}
        </div>
      )}


    </div></section>}
    {view.isStaff && !canManage && <p role="note" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">أدوات تعديل هذه السلعة وإخفائها وحذفها تتطلب صلاحيات المنتجات المناسبة. يمكن لمسؤول الصلاحيات مراجعتها من <Link className="font-bold text-primary underline" href="/admin/access-control">إدارة الصلاحيات</Link>.</p>}
    {others.length > 0 && <section className="min-w-0 space-y-3"><h2 className="text-lg font-extrabold text-primary">سلع أخرى في التجربة</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{others.map(product => <CjProductCard key={product.id} product={product} />)}</div></section>}
  </div>;
}
