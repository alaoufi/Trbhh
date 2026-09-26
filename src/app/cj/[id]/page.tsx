import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone, MessageCircle } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { cjProductCapabilities } from '@/lib/cj/access';
import { getAgent, agentContactLinks } from '@/lib/cj/agents';
import { cjProductOrderCount, getStorefrontCjProduct, getVerifiedCjVariants, listStorefrontCjProducts, parseCjDetails, parseCjAvailability } from '@/lib/cj/mapping';
import { saveCjStorefrontEdit, hideCjStorefront, deleteCjStorefront } from '../../admin/suppliers/cj/actions';
import { cjStorefrontView, cjImg, cjProductImages } from '@/lib/cj/storefront';
import { CjProductGallery } from '@/components/cj/product-gallery';
import { CjProductDescription } from '@/components/cj/product-description';
import { CjProductCard } from '@/components/cj/product-card';
import { CartLink } from '@/components/cj/cart-controls';
import { CjPurchasePanel } from '@/components/cj/purchase-panel';
import { cleanCjDisplayDescription, cjVariantDisplayOptions } from '@/lib/cj/variant-display';
import { cjProductDisplayTitle } from '@/lib/cj/presentation';
import { getSetting } from '@/lib/settings';

const editInput = 'mt-1 w-full min-w-0 rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة', robots: { index: false, follow: false } };

export default async function CjStoreProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await cjStorefrontView();
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const session = await getSession();
  const p = await getStorefrontCjProduct(id, view.isPublic);
  if (!p) notFound();
  const capabilities = session ? await cjProductCapabilities(session.uid, p.agent_user_id) : { agent: false, edit: false, suspend: false, delete: false };
  // صفحة السلعة خاصة (تجربة CJ): يفتحها الموظّف، أو وكيل السلعة النشط لإدارة سلعته
  // (يختارها/يعدّلها/يتابع شحنها/تصله رسائل الشراء) حتى لو لم يكن موظّفاً. غيرهما ممنوع.
  if (!view.isStaff && !capabilities.agent) notFound();
  const canManage = capabilities.edit || capabilities.suspend || capabilities.delete;
  const hasActivity = capabilities.delete ? (await cjProductOrderCount(p.cj_product_id)) > 0 : false;
  const productAgent = p.agent_user_id != null ? await getAgent(p.agent_user_id) : null;
  const agentContact = productAgent?.active === 1 ? agentContactLinks(productAgent) : null;
  const title = cjProductDisplayTitle(p.name_ar);
  const gallery = cjProductImages(p).map(cjImg);
  const details = parseCjDetails(p);
  const verifiedVariants = getVerifiedCjVariants(p);
  // في معاينة المشرف (بلا شحن حيّ محقّق) نعرض الخيارات من التفاصيل المخزّنة (details_json)
  // حتى تظهر المقاسات/الألوان كاملة كما في المصدر؛ العرض العام يبقى على المتغيّرات المحقّقة.
  const displayVariants = verifiedVariants.length ? verifiedVariants : (details?.variants ?? []);
  const weightMin = details?.weightMin;
  const weightMax = details?.weightMax;
  const weightLabel = typeof weightMin === 'number' && Number.isFinite(weightMin) && weightMin > 0
    ? `${weightMin}${typeof weightMax === 'number' && Number.isFinite(weightMax) && weightMax > weightMin ? `–${weightMax}` : ''} غ` : 'غير محدد';
  // معلومات التوفّر والشحن الحقيقية (المخزون + خيارات الشحن السعودية: الاسم/السعر/المدّة).
  const availability = parseCjAvailability(p);
  const sar = (m: number) => `${new Intl.NumberFormat('en-US').format(Math.round(m / 100))} ر.س`;
  const shipOptions = availability
    ? [...new Map(availability.shippingOptions.map(o => [o.name, o])).values()].sort((a, b) => a.priceMinor - b.priceMinor)
    : [];
  const shipCheapest = shipOptions[0] ?? null;
  // خيارات السلعة (اللون/المقاس/القابس...) مجمّعة بالعربية من المحلّل المُختبَر
  // cjVariantDisplayOptions (يقرأ سمات المتغيّر أو يستنتج اللون/المقاس من اسمه/مفتاحه،
  // ويتجاهل الضجيج). تُعرض من التفاصيل المخزّنة فتظهر حتى بلا توفّر حيّ محقّق.
  const optionGroups = new Map<string, string[]>();
  for (const v of displayVariants) {
    for (const opt of cjVariantDisplayOptions({ variantKey: v.optionKey, variantName: v.name })) {
      const values = optionGroups.get(opt.label) ?? [];
      if (!values.includes(opt.value)) values.push(opt.value);
      optionGroups.set(opt.label, values);
    }
  }
  const optionGroupList = [...optionGroups.entries()].map(([label, values]) => ({ label, values: values.slice(0, 40) })).slice(0, 8);
  // جدول الخيارات بتفاصيلها (كل خيار + وزنه) + شحن تقديري (سعر ثابت من الإدارة + مدّة نصّية).
  const [shipMinorRaw, deliveryDaysText] = await Promise.all([getSetting('cj_sync_shipping_minor', '0'), getSetting('cj_delivery_days_text', '٧–١٥ يوم عمل')]);
  const flatShipMinor = Math.max(0, Math.round(Number(shipMinorRaw) || 0));
  const variantRows = displayVariants.map(v => {
    const opts = cjVariantDisplayOptions({ variantKey: v.optionKey, variantName: v.name }).map(o => `${o.label}: ${o.value}`).join(' · ');
    return { key: v.vid, label: opts || (v.name || v.optionKey || '').trim() || '—', weight: v.weight };
  }).slice(0, 60);
  const others = (await listStorefrontCjProducts(view.isPublic, 24)).filter(row => Number(row.id) !== id).slice(0, 6);

  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 pb-32 pt-5 sm:px-5 md:pb-8 [overflow-wrap:anywhere]" data-cj-trial="product">
    {view.isStaff && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><b>معاينة خاصة</b> — تجميع السلع فقط؛ الشراء والدفع غير مفعّلين.</p>{session && <CartLink accountId={session.uid} />}</div>}
    {sp.edited === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">تم حفظ تعديل السلعة.</p>}
    {sp.err === 'has_activity' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">تعذّر الحذف لوجود نشاط على السلعة. يمكنك إخفاؤها.</p>}
    <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/cj" className="font-bold text-primary hover:underline">المتجر</Link><span aria-hidden="true">/</span><span>تفاصيل المنتج</span></nav>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <CjProductGallery key={id} images={gallery} title={title} />
      <section aria-label="معلومات المنتج" className="min-w-0 space-y-4">
        {p.trbhh_category && <p className="text-xs leading-6 text-slate-500">{p.trbhh_category}</p>}
        <h1 className="text-xl font-extrabold leading-8 text-primary sm:text-2xl">{title}</h1>
        {view.isStaff && session && (verifiedVariants.length > 0
          ? <CjPurchasePanel productId={id} productPid={p.cj_product_id} productName={title} accountId={session.uid} isStaff={view.isStaff} variants={verifiedVariants.map(variant=>({vid:variant.vid,variantSku:variant.sku,variantName:variant.name,variantKey:variant.optionKey,variantSellPrice:variant.priceUsd,variantImage:null,variantWeight:variant.weight,attributes:variant.attributes}))} />
          : <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">هذه السلعة مخفية عن المشترين: لا يوجد خيار ثبت مخزونه وشحنه إلى السعودية. أعد التحقق من التوفّر قبل إتاحتها.</p>)}
        {optionGroupList.length > 0 && <div className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-700">الخيارات المتاحة</h2>
          {optionGroupList.map(group => <div key={group.label} className="min-w-0">
            <h3 className="mb-1.5 text-xs font-bold text-slate-500">{group.label}</h3>
            <div className="flex flex-wrap gap-1.5">{group.values.map((val, i) => <span key={i} className="rounded-lg border border-primary/25 bg-white px-2.5 py-1 text-xs font-semibold">{val}</span>)}</div>
          </div>)}
        </div>}
        {variantRows.length > 1 && <details className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-bold text-slate-700">تفاصيل الخيارات ({variantRows.length})</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[280px] text-right text-xs"><thead className="bg-slate-50"><tr>{['الخيار', 'الوزن'].map(h => <th key={h} className="p-2 font-bold text-slate-600">{h}</th>)}</tr></thead><tbody>
            {variantRows.map(r => <tr key={r.key} className="border-t"><td className="p-2" dir="auto">{r.label}</td><td className="p-2 text-slate-600">{r.weight != null ? `${r.weight} غ` : '—'}</td></tr>)}
          </tbody></table></div>
        </details>}
        {!availability && <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm"><h2 className="mb-2 text-sm font-bold text-emerald-900">الشحن إلى السعودية</h2>
          <ul className="space-y-1.5">
            <li className="flex items-center justify-between gap-2"><span className="text-slate-700">الشحن</span><b className="text-emerald-800">{flatShipMinor > 0 ? sar(flatShipMinor) : 'شحن مجاني'}</b></li>
            <li className="flex items-center justify-between gap-2"><span className="text-slate-700">مدّة التوصيل</span><b className="text-emerald-800" dir="auto">{deliveryDaysText}</b></li>
          </ul>
        </div>}
        {availability && <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><h2 className="mb-3 text-sm font-bold text-emerald-900">الشحن إلى السعودية</h2><ul className="space-y-2 text-sm">{shipOptions.slice(0, 5).map((o, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2 last:border-0 last:pb-0"><span className="font-semibold text-slate-800">{o.name}{o.deliveryDays ? <span className="ms-2 text-xs font-normal text-slate-500">مدّة التوصيل: {o.deliveryDays}</span> : null}</span><span className="font-extrabold text-emerald-800">{sar(o.priceMinor)}</span></li>)}</ul><p className="mt-2 text-xs text-emerald-800">المخزون المتوفّر: {new Intl.NumberFormat('en-US').format(availability.stockQuantity)} · {shipCheapest ? `يبدأ الشحن من ${sar(shipCheapest.priceMinor)}` : ''}</p></div>}
        {agentContact && (agentContact.wa || agentContact.tel) && <section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">التواصل مع وكيل السلعة</h2><div className="flex flex-wrap gap-2">{agentContact.wa && <a href={agentContact.wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />واتساب</a>}{agentContact.tel && <a href={agentContact.tel} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold text-primary"><Phone className="h-4 w-4" />اتصال</a>}</div></section>}
      </section>
    </div>
    {(p.trbhh_category||details?.weightMin)&&<section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cj-specs"><h2 id="cj-specs" className="mb-3 text-lg font-extrabold text-primary">المواصفات</h2><dl className="divide-y divide-slate-100 text-sm">{[["التصنيف",p.trbhh_category],['الوزن',details?.weightMin?weightLabel:null]].filter((entry):entry is [string,string]=>Boolean(entry[1])).map(([label,value])=><div key={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-3"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 font-semibold" dir="auto">{value}</dd></div>)}</dl></section>}
    {!!p.display_description_ar&&<section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cj-description"><h2 id="cj-description" className="mb-3 text-lg font-extrabold text-primary">تفاصيل المنتج</h2><CjProductDescription text={cleanCjDisplayDescription(p.display_description_ar)} /></section>}
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
