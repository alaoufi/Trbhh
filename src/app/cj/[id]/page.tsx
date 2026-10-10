import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone, MessageCircle, Truck, RotateCcw, ShieldCheck, ChevronDown } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { cjProductCapabilities } from '@/lib/cj/access';
import { getAgent, agentContactLinks } from '@/lib/cj/agents';
import { cjProductOrderCount, getStorefrontCjProduct, getVerifiedCjVariants, listStorefrontCjProducts, parseCjDetails, cjArabicName, cjArabicDescription } from '@/lib/cj/mapping';
import { saveCjStorefrontEdit, hideCjStorefront, deleteCjStorefront } from '../../admin/suppliers/cj/actions';
import { cjStorefrontView, cjImg, cjProductImages } from '@/lib/cj/storefront';
import { Breadcrumb } from '@/components/breadcrumb';
import { CjProductGallery } from '@/components/cj/product-gallery';
import { CjProductDescription } from '@/components/cj/product-description';
import { CjProductCard } from '@/components/cj/product-card';
import { CartLink } from '@/components/cj/cart-controls';
import { CjPurchasePanel } from '@/components/cj/purchase-panel';
import { SubmitButton } from '@/components/cj/submit-button';
import { cleanCjDisplayDescription } from '@/lib/cj/variant-display';
import { cjProductDisplayTitle, cjDescriptionText, cjPriceLabel } from '@/lib/cj/presentation';
import { PriceText } from '@/components/price-text';
import { CjLiveNumbers } from '@/components/cj/cj-live-numbers';
import { translateVariantOptions } from '@/lib/cj/variant-display-server';
import { getCjCategoryOptions } from '@/lib/cj/categories';

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
  // عدد عمليات الشراء الحقيقية من طلبات CJ — بيانات تتراكم من النشاط الفعلي (تبدأ من صفر، بلا تزييف).
  const soldCount = await cjProductOrderCount(p.cj_product_id).catch(() => 0);
  const hasActivity = capabilities.delete ? soldCount > 0 : false;
  const productAgent = p.agent_user_id != null ? await getAgent(p.agent_user_id) : null;
  const agentContact = productAgent?.active === 1 ? agentContactLinks(productAgent) : null;
  // ترجمة فورية عند التحميل بلا أزرار: العنوان والوصف يُعرضان بالعربية متى كان المترجم شغّالاً
  // (يُحفظان دائماً بعد أول ترجمة). إن كان name_ar إنجليزياً من محاولة سابقة يُصحَّح هنا.
  const arabicName = await cjArabicName(p, true);
  const title = cjProductDisplayTitle(arabicName);
  const descriptionAr = await cjArabicDescription(p, true);
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
  // خيارات السلعة (اللون/المقاس/القابس...) مجمّعة بالعربية من المحلّل المُختبَر
  // الشحن والمخزون والمدّة الحقيقية تُعرض حيّاً من CJ عبر CjLiveNumbers في قسم الشحن.
  const categoryOptions = await getCjCategoryOptions();
  const highlightOptions = canManage ? await (await import('@/lib/cj/highlight')).cjHighlightLabels() : [];
  // الإجراء الموحّد: ترجمة خيارات كل متغيّر على الخادم مرّة، وتُستخدم في جدول الخيارات
  // ولوحة الشراء (الاختيار بالسمات) معاً — فلا يبقى خيار غير مترجم في أي مكان. الاختيار الفعلي
  // (لون/مقاس) داخل لوحة الشراء ويُحفظ مع الطلب؛ لا قائمة عرض منفصلة غير قابلة للاختيار.
  const translatedVariants = await translateVariantOptions(displayVariants.map(v => ({ vid: v.vid, variantKey: v.optionKey, variantName: v.name, attributes: v.attributes })));
  const variantRows = displayVariants.map(v => ({ key: v.vid, label: translatedVariants[v.vid]?.label || '—', weight: v.weight })).slice(0, 60);
  const panelLabels = Object.fromEntries(Object.entries(translatedVariants).map(([vid, t]) => [vid, t.label]));
  const panelOptions = Object.fromEntries(Object.entries(translatedVariants).map(([vid, t]) => [vid, t.options]));
  const others = (await listStorefrontCjProducts(view.isPublic, 24)).filter(row => Number(row.id) !== id).slice(0, 6);

  return <div className="mx-auto max-w-6xl min-w-0 space-y-3 px-3 pb-32 pt-4 sm:px-5 md:pb-8 [overflow-wrap:anywhere]" data-cj-trial="product">
    {view.isStaff && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><b>شراء خاص بالإدارة</b> — تحقّق حيّ من السعر والمخزون والشحن، ثم السلة ← إنشاء الطلب ← الاعتماد والدفع من المحفظة ← التتبّع حتى التسليم.</p>{session && <CartLink accountId={session.uid} />}</div>}
    {sp.edited === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">تم حفظ تعديل السلعة.</p>}
    {sp.err === 'has_activity' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">تعذّر الحذف لوجود نشاط على السلعة. يمكنك إخفاؤها.</p>}
    <Breadcrumb items={[{ label: 'منتجات تربح', href: '/cj' }, { label: title }]} />
    <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <CjProductGallery key={id} images={gallery} title={title} />
      <section aria-label="معلومات المنتج" className="min-w-0 space-y-2.5">
        {p.trbhh_category && <p className="text-xs leading-5 text-slate-500">{p.trbhh_category}</p>}
        <h1 className="text-lg font-extrabold leading-7 text-primary sm:text-2xl">{title}</h1>
        {/* سعر بارز (السعر النهائي بالريال، شامل ربح تربح) — يُخفى إن لم تُسعّر السلعة بعد. */}
        {(p.sale_price_override_minor ?? p.sale_price_minor) > 0 && <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <PriceText size="detail">{cjPriceLabel(p.sale_price_override_minor ?? p.sale_price_minor, p.currency)}</PriceText>
          <span className="text-xs text-slate-500">شامل الضريبة عند تطبيقها · يُضاف الشحن حسب الوجهة</span>
        </div>}
        {/* عدد عمليات الشراء الحقيقية — يظهر فقط من أول عملية فعلية (بلا تزييف). */}
        {soldCount > 0 && <p className="text-xs text-slate-500">عمليات شراء مؤكّدة: <b className="text-slate-700">{soldCount.toLocaleString('en')}</b></p>}
        {/* السلة والشراء مُفعّلان للإدارة (تجربة): يُعرض محرّك الشراء لكل السلع ذات الخيارات،
            ويتحقّق حيّاً من المخزون والشحن عند الاختيار قبل الإضافة للسلة. لا دفع فعلي إلا بعد
            الاعتماد وتفعيل الطلبات الحيّة. الخيارات هنا من بيانات السلعة (محقّقة أو تفصيلية). */}
        <div id="cj-buy" className="scroll-mt-24" />
        {view.isStaff && session && (displayVariants.length > 0
          ? <>
              {verifiedVariants.length === 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">تجربة إدارية: لم يُحقَّق توفّر هذه السلعة للعرض العام بعد. يتم التحقّق حيّاً من المخزون والشحن عند اختيار الخيار، ولا يُنفَّذ أي دفع فعلي إلا بعد الاعتماد والتحقّق من الأرقام.</p>}
              <CjPurchasePanel productId={id} productPid={p.cj_product_id} productName={title} accountId={session.uid} isStaff={view.isStaff} labels={panelLabels} optionsByVid={panelOptions} variants={displayVariants.map(variant=>({vid:variant.vid,variantSku:variant.sku,variantName:variant.name,variantKey:variant.optionKey,variantSellPrice:variant.priceUsd,variantImage:null,variantWeight:variant.weight,attributes:variant.attributes}))} />
            </>
          : <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">لا توجد خيارات متاحة لهذه السلعة حالياً.</p>)}
        {variantRows.length > 1 && <details className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-bold text-slate-700">تفاصيل الخيارات ({variantRows.length})</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[280px] text-right text-xs"><thead className="bg-slate-50"><tr>{['الخيار', 'الوزن'].map(h => <th key={h} className="p-2 font-bold text-slate-600">{h}</th>)}</tr></thead><tbody>
            {variantRows.map(r => <tr key={r.key} className="border-t"><td className="p-2" dir="auto">{r.label}</td><td className="p-2 text-slate-600">{r.weight != null ? `${r.weight} غ` : '—'}</td></tr>)}
          </tbody></table></div>
        </details>}
        {/* الشحن إلى السعودية — قسم قابل للطيّ بسهم للأسفل؛ يتمدّد بالنقر ويجلب الأرقام الحيّة عندها. */}
        <details className="group/s min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-base font-extrabold text-emerald-900 [&::-webkit-details-marker]:hidden">
            الشحن إلى السعودية
            <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open/s:rotate-180" />
          </summary>
          <div className="pb-4"><CjLiveNumbers pid={p.cj_product_id} priceMinor={p.sale_price_override_minor ?? p.sale_price_minor} /></div>
        </details>
        {agentContact && (agentContact.wa || agentContact.tel) && <section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">التواصل مع وكيل السلعة</h2><div className="flex flex-wrap gap-2">{agentContact.wa && <a href={agentContact.wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />واتساب</a>}{agentContact.tel && <a href={agentContact.tel} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold text-primary"><Phone className="h-4 w-4" />اتصال</a>}</div></section>}
      </section>
    </div>
    {(p.trbhh_category||details?.weightMin)&&<section className="card-3d min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby="cj-specs"><h2 id="cj-specs" className="mb-3 text-lg font-extrabold text-primary">المواصفات</h2><dl className="divide-y divide-slate-100 text-sm">{[["القسم",p.trbhh_category],['الوزن',details?.weightMin?weightLabel:null]].filter((entry):entry is [string,string]=>Boolean(entry[1])).map(([label,value])=><div key={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-3"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 font-semibold" dir="auto">{value}</dd></div>)}</dl></section>}
    {!!descriptionAr&&<section className="card-3d min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby="cj-description"><h2 id="cj-description" className="mb-3 text-lg font-extrabold text-primary">تفاصيل المنتج</h2><CjProductDescription text={cleanCjDisplayDescription(descriptionAr)} /></section>}
    {/* ضمانات الشحن والاسترجاع — بهوية تربح وأيقونات واضحة (لا تمسّ بيانات CJ). */}
    <section className="card-3d min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby="cj-guarantees"><h2 id="cj-guarantees" className="mb-3 text-lg font-extrabold text-primary">الشحن والضمانات</h2>
      <ul className="divide-y divide-slate-100 text-sm leading-7 text-slate-700">
        <li className="flex items-start gap-3 py-2.5"><Truck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><span><b>توصيل لكل مناطق المملكة</b> — تُحتسب تكلفة الشحن ومدّته حسب الوجهة وتظهر عند الطلب (مدّة التجهيز تُضاف للتوصيل).</span></li>
        <li className="flex items-start gap-3 py-2.5"><RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><span><b>استرجاع واستبدال</b> وفق سياسة تربح المعلنة.</span></li>
        <li className="flex items-start gap-3 py-2.5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><span><b>دفع آمن وخصوصية</b> — بياناتك محمية، والسعر بالريال شامل ربح تربح (يُضاف الشحن والضريبة إن وُجدت عند الطلب).</span></li>
      </ul>
    </section>
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
              <label className="block">الوصف العربي<textarea name="descriptionAr" rows={4} defaultValue={p.display_description_ar ? cjDescriptionText(p.display_description_ar) : ''} className={editInput} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">القسم
                  <select name="trbhhCategory" defaultValue={p.trbhh_category && categoryOptions.includes(p.trbhh_category) ? p.trbhh_category : ''} className={editInput}>
                    <option value="">— اختر تصنيف تربح —</option>
                    {categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  {categoryOptions.length === 0
                    ? <span className="mt-1 block text-xs text-amber-700">لا توجد تصنيفات بعد — أضِفها من لوحة الإدارة (إعدادات التوريد ← التصنيفات).</span>
                    : p.trbhh_category && !categoryOptions.includes(p.trbhh_category) && <span className="mt-1 block text-xs text-amber-700">التصنيف الحالي غير موحّد — اختر تصنيف تربح لتوحيد السلع المتشابهة.</span>}
                </label>
                <label className="block">السعر (ر.س) — فارغ = المحسوب<input name="priceSar" inputMode="decimal" defaultValue={p.sale_price_override_minor != null ? (p.sale_price_override_minor / 100).toString() : ''} placeholder={(p.sale_price_minor / 100).toString()} className={editInput} /></label>
                <label className="block">التمييز (يظهر على الصورة)
                  <select name="highlightLabel" defaultValue={p.highlight_label || ''} className={editInput}>
                    <option value="">— بلا تمييز —</option>
                    {highlightOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <span className="mt-1 block text-xs text-muted-foreground">تُدار الأوسمة من إعدادات التوريد (cj_highlight_labels).</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <SubmitButton className="rounded-lg bg-primary px-4 py-2 font-bold text-white" pendingText="جارٍ الحفظ…">حفظ التعديل</SubmitButton>
                <span className="text-xs text-muted-foreground">تصحيح العنوان/الوصف يُحفظ في ذاكرة الترجمة ويُطبَّق على السلع المشابهة.</span>
              </div>
            </form>
          </div>}
        </div>
      )}


    </div></section>}
    {view.isStaff && !canManage && <p role="note" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">أدوات تعديل هذه السلعة وإخفائها وحذفها تتطلب صلاحيات المنتجات المناسبة. يمكن لمسؤول الصلاحيات مراجعتها من <Link className="font-bold text-primary underline" href="/admin/access-control">إدارة الصلاحيات</Link>.</p>}
    {others.length > 0 && <section className="min-w-0 space-y-3"><h2 className="text-lg font-extrabold text-primary">منتجات مشابهة</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{others.map(product => <CjProductCard key={product.id} product={product} />)}</div></section>}
    {/* شريط شراء ثابت (نمط المتاجر) فوق القائمة السفلية؛ ينتقل لمحرّك الاختيار والإضافة. للإدارة. */}
    {view.isStaff && session && displayVariants.length > 0 && <div className="fixed inset-x-0 bottom-[4.5rem] z-30 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        {(p.sale_price_override_minor ?? p.sale_price_minor) > 0 && <div className="min-w-0"><span className="block text-[10px] text-slate-500">السعر (شامل ربح تربح)</span><PriceText>{cjPriceLabel(p.sale_price_override_minor ?? p.sale_price_minor, p.currency)}</PriceText></div>}
        <a href="#cj-buy" className="inline-flex min-h-12 w-1/2 max-w-xs items-center justify-center rounded-xl bg-primary px-5 text-sm font-extrabold text-white">اختر وأضف إلى السلة</a>
      </div>
    </div>}
  </div>;
}
