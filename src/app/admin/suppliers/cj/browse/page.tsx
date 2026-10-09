import { AccessBoundary } from '@/components/access-boundary';
import { CjProductImage } from '@/components/cj/product-image';
import Link from 'next/link';
import { requireAccess } from '@/lib/access-control/guards';
import { cjConfig } from '@/lib/cj/config';
import { listProductsPage, getCategories } from '@/lib/cj/client';
import { translateArabicCjSearch } from '@/lib/cj/search';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { verifyCjVariantForSaudi } from '@/lib/cj/availability';
import { importedCjPids, listCjProducts } from '@/lib/cj/mapping';
import { cjSyncSettings } from '@/lib/cj/sync';
import { defaultMarginBps, computePrice } from '@/lib/cj/pricing';
import { getCachedArabic, translateManyForDisplay, isArabicText, DEFAULT_LIBRETRANSLATE_URL } from '@/lib/cj/translate';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { importCjProduct, removeCjProduct, saveCjArabic, saveCjPrice, toggleCjHidden, translateCjProduct, translateAllCj, refreshCjImportedAvailability, saveCjTranslationSettings, processAllCjImported } from '../actions';
import { SubmitButton } from '@/components/cj/submit-button';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { CjText } from '@/components/cj/cj-text';
import { CjLiveNumbers } from '@/components/cj/cj-live-numbers';
import { BrowseFilter } from '@/components/cj/browse-filter';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تصفّح منتجات CJ واستيرادها' };

const PAGE_SIZE = 24;
const card = 'card-3d rounded-xl p-3 space-y-2';
const btn = 'rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40';
const ghost = 'rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary';
const input = 'min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
const sar = (m: number | null) => (m == null ? '—' : `${(m / 100).toFixed(2)} ر.س`);
const usd = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
const translationFeedback = {
  complete: 'أصبحت ترجمات منتجات هذه الصفحة متاحة من المخزن.',
  partial: 'توفّر بعض الترجمات. يمكنك إعادة المحاولة لاستكمال الباقي.',
  empty: 'لا توجد منتجات لترجمتها في هذه الصفحة.',
  invalid: 'تعذّر تحديد الصفحة أو مرشحات البحث. أعد فتح الصفحة وحاول مجددًا.',
  unavailable: 'تعذّر استكمال ترجمة الصفحة الآن. بقيت بيانات المنتجات الأصلية دون تغيير؛ حاول لاحقًا.',
};

export default async function CjBrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const translationNotice = typeof sp.page_translation === 'string' && Object.hasOwn(translationFeedback, sp.page_translation) ? translationFeedback[sp.page_translation as keyof typeof translationFeedback] : null;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 100) : '';
  const cat = typeof sp.cat === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(sp.cat) ? sp.cat : '';
  const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1') || 1);
  const detailPid = typeof sp.detail === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(sp.detail) ? sp.detail : '';
  const cfg = cjConfig();

  if (!cfg.configured) {
    return <div className="space-y-3"><h1 className="text-xl font-extrabold text-primary">تصفّح منتجات CJ</h1><p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm">اضبط متغيّرات CJ (البريد والمفتاح) في بيئة الخادم أولاً.</p></div>;
  }

  const [settings, marginBps, catsRes] = await Promise.all([cjSyncSettings(), defaultMarginBps(), getCategories()]);
  const [deeplKeySet, memEmail, libreUrl] = await Promise.all([getSetting('cj_deepl_api_key', ''), getSetting('cj_mymemory_email', ''), getSetting('cj_libretranslate_url', DEFAULT_LIBRETRANSLATE_URL)]);
  const categories = catsRes.ok ? catsRes.data : [];
  // CJ indexes product names in its source language, while admins commonly
  // search using the saved Arabic display title. Translate only the query;
  // keep the Arabic text in the URL and search box.
  const sourceQuery = q ? await translateArabicCjSearch(q) : '';
  // CJ يفهرس بالاسم المصدر الإنجليزي. عند فشل ترجمة عبارة عربية لا نرسل العربية إلى CJ
  // (تُرجِع نتائج غير ذات صلة)، بل نُلغي فلتر الاسم ونعرض تنبيهاً للمستخدم.
  const queryIsArabic = !!q && /\p{Script=Arabic}/u.test(q);
  const searchName = sourceQuery ? sourceQuery : (queryIsArabic ? undefined : (q || undefined));
  const listing = await listProductsPage(page, PAGE_SIZE, { productName: searchName, categoryId: cat || undefined });
  const items = listing.ok ? listing.data.items : [];
  // صلاحية العرض تقرأ الترجمات المحفوظة فقط؛ الترجمة والكتابة إجراءات تحرير صريحة.
  const importedList = await listCjProducts(60);
  const titleTexts = items.map((p) => p.productName);
  const cardCats = items.map((p) => p.categoryName ?? '').filter(Boolean);
  const catNames = categories.flatMap(c => [c.name, c.path, ...c.path.split(/\s*[›>]\s*/)]);
  // ترجمة فورية عند التحميل من الخادم عبر المترجم المحلي (LibreTranslate) ثم تُخزَّن؛ ما
  // يتعذّر ترجمته ضمن الميزانية يُترجَم في المتصفح عبر CjText. عناوين الشبكة والأقسام
  // لها الأولوية (أكثر ظهوراً)؛ المستوردة تُقرأ من المخزَّن (أسماؤها محرَّرة يدوياً غالباً).
  const [gridAr, catAr, importedAr] = await Promise.all([
    translateManyForDisplay([...titleTexts, ...cardCats], 60),
    translateManyForDisplay(catNames, 80),
    getCachedArabic(importedList.flatMap(r => [r.name, r.trbhh_category])),
  ]);
  for (const [k, v] of importedAr) if (!gridAr.has(k)) gridAr.set(k, v);
  const arText = (t: string | null | undefined) => {
    if (!t) return '—';
    if (isArabicText(t)) return t;
    const saved = gridAr.get(t.trim()) ?? catAr.get(t.trim());
    // لا نعرض «الترجمة غير متاحة» كحالة نهائية: نُظهر «بانتظار الترجمة» (حالة مؤقتة
    // تكملها مهمة الترجمة الدورية تلقائياً)، والنص الأصلي يبقى ظاهراً في تفاصيله.
    return isArabicText(saved) ? saved! : 'بانتظار الترجمة';
  };
  const categoryLabels = new Map(categories.map((c, index) => {
    const translatedPath = isArabicText(c.path) ? c.path : catAr.get(c.path.trim());
    const pathParts = c.path.split(/\s*[›>]\s*/).map(part => isArabicText(part) ? part : catAr.get(part.trim()));
    const translatedName = isArabicText(c.name) ? c.name : catAr.get(c.name.trim());
    const label = isArabicText(translatedPath) ? translatedPath! : pathParts.length > 1 && pathParts.every(isArabicText) ? pathParts.join(' › ') : isArabicText(translatedName) ? translatedName! : `تصنيف بانتظار الترجمة (${index + 1})`;
    return [c.id, label];
  }));
  const total = listing.ok ? listing.data.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const imported = items.length ? await importedCjPids(items.map((p) => p.pid)) : new Set<string>();
  const detail = detailPid ? await sampleOneCjProduct(detailPid) : null;
  // سرعة التفاصيل: نترجم الاسم والقسم فورياً فقط؛ أسماء المتغيّرات تُقرأ من المخزَّن بلا
  // ترجمة حيّة لكل متغيّر (كان سبب البطء عند فتح التفاصيل لمنتج بعشرات الخيارات).
  const detailAr = detail && detail.ok
    ? await translateManyForDisplay([detail.data.name, detail.data.category ?? ''], 6)
    : new Map<string, string>();
  const detailVariantAr = detail && detail.ok
    ? await getCachedArabic(detail.data.variants.map((v) => v.name ?? ''))
    : new Map<string, string>();
  const arOf = (t: string | null | undefined) => t && isArabicText(detailAr.get(t.trim()) ?? detailVariantAr.get(t.trim())) ? (detailAr.get(t.trim()) ?? detailVariantAr.get(t.trim()))! : arText(t);
  // القيم الحقيقية الحيّة (الأصل): السعر والمخزون والشحن من CJ. نختار المتغيّر الأعلى مخزوناً
  // في العيّنة (الأرجح توفّراً) ليظهر الشحن/المخزون الحيّ بدل الفشل على متغيّر نافد.
  const liveVariant = detail && detail.ok
    ? [...detail.data.variants]
        .filter((v) => typeof v.priceUsd === 'number' && v.priceUsd! > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(v.vid))
        .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0] ?? null
    : null;
  const detailLive = detail && detail.ok && liveVariant
    ? await verifyCjVariantForSaudi(detailPid, { vid: liveVariant.vid, variantSku: liveVariant.sku, variantName: liveVariant.name, variantKey: null, variantSellPrice: liveVariant.priceUsd, variantImage: null, variantWeight: liveVariant.weight, attributes: {} }, 1, {}, settings.usdToSarX100, { marginBps }).catch(() => null)
    : null;
  const liveShip = detailLive?.status === 'available' ? [...detailLive.shippingOptions].sort((a, b) => (a.priceMinor + a.additionalMinor) - (b.priceMinor + b.additionalMinor))[0] : null;
  const salePreview = (u: number | null) => (u != null && u > 0 ? computePrice(Math.round(u * settings.usdToSarX100), settings.shippingMinor, 0, marginBps).salePriceMinor : null);
  const keep = `${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`;
  const pageHref = (n: number) => `/admin/suppliers/cj/browse?page=${Math.min(Math.max(1, n), totalPages)}${keep}`;
  const backHref = `/admin/suppliers/cj/browse?page=${page}${keep}`;
  const activeCat = categories.find((c) => c.id === cat);

  return (
    <div className="space-y-4">
      <CjAdminNav current="browse" />
      <h1 className="text-xl font-extrabold text-primary">تصفّح منتجات CJ واستيرادها</h1>

      {/* معالجة شاملة (زر واحد) — أعلى الصفحة ليسهُل إيجادها */}
      <AccessBoundary module="products" action="edit"><div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-primary">⚙️ معالجة شاملة للسلع المستوردة (زر واحد)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">تحديث الصور والخيارات والتفاصيل + <b>الشحن الحقيقي من المورد</b> + ترجمة الاسم/الوصف الناقصين. يعالج دفعة (١٠) لكل ضغطة — اضغط ثانيةً للباقي حتى تكتمل الدورة.</p>
          </div>
          <form action={processAllCjImported}>
            <SubmitButton className={`${btn} min-h-11 px-5 text-base`} pendingText="جارٍ المعالجة…">معالجة شاملة الآن</SubmitButton>
          </form>
        </div>
        {sp.bulk === '1' && <div className="mt-2 space-y-1">
          <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">عولجت {sp.processed} سلعة · شحن حقيقي لـ{sp.shipped} · تُرجمت {sp.tr}{Number(sp.failed) > 0 ? ` · تعذّر ${sp.failed}` : ''} · {sp.done === '1' ? 'اكتملت معالجة كل السلع ✅' : `متبقٍّ ${sp.remaining} — اضغط مجدداً للمتابعة.`}</p>
          {sp.processed === '0' && sp.failed === '0' && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">لا توجد سلع مستوردة لمعالجتها بعد — استورد سلعاً من الكتالوج أدناه أولاً.</p>}
          {Number(sp.failed) > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">تعذّر جلب {sp.failed} سلعة من المورد (قد تكون مفاتيح CJ غير مضبوطة أو حدّ الطلبات). البيانات القائمة لم تُمسح. تأكّد من ضبط CJ في الإعدادات وأعد المحاولة.</p>}
          {sp.shipped === '0' && sp.processed !== '0' && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">لم يُحتسب شحن حقيقي لأي سلعة في هذه الدفعة — تحقّق من أن مفاتيح CJ تعمل («اختبار الاتصال» في الإعدادات) ومن توفّر شحن للسعودية.</p>}
        </div>}
      </div></AccessBoundary>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        عرض مباشر من CJ API (قراءة فقط). <b>لا يُستورد أو يُنشر أي منتج تلقائياً</b> — الاستيراد للمنتجات المختارة فقط،
        وتبقى في التخزين الوسيط ولا تظهر للعامة حتى ربطها واعتمادها. سعر البيع أدناه تقديري (تكلفة×صرف {(settings.usdToSarX100 / 100).toFixed(2)} + شحن {sar(settings.shippingMinor)} + هامش {(marginBps / 100).toFixed(0)}٪).
      </p>

      {/* تنبيهات */}
      {translationNotice && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{translationNotice}</p>}
      {typeof sp.imported === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم استيراد المنتج {sp.imported} إلى التخزين الوسيط ✓ (لم يُعرض للعامة).</p>}
      {typeof sp.imperr === 'string' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر استيراد المنتج. أعد المحاولة من إجراء الاستيراد.</p>}
      {sp.removed === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حذف المنتج من التخزين الوسيط.</p>}
      {!listing.ok && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر جلب المنتجات من CJ الآن. أعد المحاولة لاحقًا.</p>}

      {/* بحث + فلترة بأقسام البضائع — القسم يُطبَّق فوراً عند الاختيار (بلا زر عرض) */}
      <BrowseFilter q={q} cat={cat} categories={[{ id: '', label: `كل الأقسام${total ? ` (${total.toLocaleString('en')})` : ''}` }, ...categories.map((c) => ({ id: c.id, label: categoryLabels.get(c.id) || c.path }))]} />
      {q && /\p{Script=Arabic}/u.test(q) && <p role="status" className="text-xs text-muted-foreground">{sourceQuery ? 'تم البحث عن الاسم العربي باستخدام اسمه في مصدر CJ.' : 'تعذّرت ترجمة عبارة البحث الآن؛ أعد المحاولة أو ابحث بالاسم كما يظهر في المصدر.'}</p>}
      <p className="text-xs text-muted-foreground">الترجمة فورية عند التحميل؛ أي كلمة بقيت بلغتها اضغط عليها لجلب ترجمتها. الصور تُحمَّل مباشرة، وإن تعذّرت صورة اضغط عليها لإعادة تحميلها.</p>
      <AccessBoundary module="integrations" action="manage_settings"><details className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
        <summary className="cursor-pointer font-bold text-primary">مزوّد الترجمة — {libreUrl ? 'LibreTranslate ذاتي ✅' : deeplKeySet ? 'DeepL مُفعّل ✅' : 'خارجي مجاني (محدود)'}</summary>
        <form action={saveCjTranslationSettings} className="mt-3 space-y-2">
          <input type="hidden" name="back" value={backHref} />
          <p className="text-xs text-muted-foreground">الأفضل: <b>LibreTranslate ذاتي على الخادم</b> — بلا إنترنت/اشتراك/حصّة، أسرع وأكثر أماناً. شغّله على الخادم ثم ضع رابطه هنا (مثل <code>http://libretranslate:5000</code>). عند ضبطه يصبح المزوّد الأساسي. ترتيب المزوّدات: LibreTranslate ← DeepL ← MyMemory.</p>
          <label className="block">رابط LibreTranslate الذاتي (الأفضل)
            <input name="libreUrl" type="url" autoComplete="off" defaultValue={libreUrl} placeholder="http://libretranslate:5000" className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2" />
          </label>
          <label className="block">مفتاح LibreTranslate (اختياري)
            <input name="libreKey" type="password" autoComplete="off" placeholder="اتركه فارغاً إن لم يُطلب" className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2" />
          </label>
          <label className="block">مفتاح DeepL API {deeplKeySet && <span className="text-emerald-700">(مضبوط — اتركه فارغاً للإبقاء عليه)</span>}
            <input name="deeplKey" type="password" autoComplete="off" placeholder={deeplKeySet ? '•••••••• (محفوظ)' : 'xxxxxxxx-xxxx-...:fx'} className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2" />
          </label>
          <label className="block">بريد MyMemory (اختياري — يرفع الحصّة المجانية للاحتياطي)
            <input name="mymemoryEmail" type="email" autoComplete="off" defaultValue={memEmail} placeholder="you@example.com" className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2" />
          </label>
          <SubmitButton className={btn} pendingText="جارٍ الحفظ…">حفظ إعدادات الترجمة</SubmitButton>
        </form>
      </details></AccessBoundary>
      <div className="hidden">
      </div>
      {!categories.length && <p className="text-xs text-amber-700">تعذّر جلب شجرة التصنيفات من CJ الآن — البحث بالاسم يعمل، وأعد المحاولة لاحقاً.</p>}

      {/* ملخّص النتائج */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {listing.ok ? <>إجمالي المنتجات{activeCat ? ` في «${categoryLabels.get(activeCat.id)}»` : ''}{q ? ` للبحث «${q}»` : ''}: <b className="text-primary">{total.toLocaleString('en')}</b> · صفحة {page.toLocaleString('en')} من {totalPages.toLocaleString('en')}</> : '—'}
        </span>
      </div>
      {q && queryIsArabic && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600" dir="auto">{searchName ? <>البحث في CJ تمّ بالمصطلح الإنجليزي: <b dir="ltr">«{searchName}»</b>. إن كانت الترجمة غير دقيقة فالنتائج قد تكون غير مطابقة — جرّب كلمة إنجليزية مباشرة (مثل <code>screen</code>) للمقارنة.</> : 'تعذّرت ترجمة العبارة العربية إلى الإنجليزية الآن (مزوّد الترجمة غير جاهز) — عُرضت منتجات عامة بلا فلتر اسم. انتظر اكتمال نماذج LibreTranslate أو ابحث بالإنجليزية.'}</p>}

      {/* شبكة المنتجات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div key={p.pid} id={`p-${p.pid}`} className={`${card} scroll-mt-24`}>
            <CjProductImage src={cjImg(p.productImage)} alt={p.productName} className="h-36 w-full rounded-lg object-cover" />
            <div className="text-sm font-bold leading-5 line-clamp-2"><CjText original={p.productName} ar={gridAr.get(p.productName.trim())} /></div>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>PID: <span dir="ltr">{p.pid}</span></span>
              <span>SKU: <span dir="ltr">{p.productSku || '—'}</span></span>
              <span>القسم: {p.categoryName ? <CjText original={p.categoryName} ar={gridAr.get(p.categoryName.trim()) ?? catAr.get(p.categoryName.trim())} /> : '—'}</span>
              <span>سعر CJ: {usd(p.sellPrice)}</span>
            </div>
            {/* الأرقام الحقيقية الحيّة تُجلب لحظياً عند تحميل الصفحة (بلا تخزين مسبق) — تدريجياً لكل بطاقة. */}
            <CjLiveNumbers pid={p.pid} />
            <div className="flex flex-wrap gap-2 pt-1">
              {imported.has(p.pid)
                ? <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">مستورد ✓</span>
                : <AccessBoundary module="products" action="create"><form action={importCjProduct}><input type="hidden" name="pid" value={p.pid} /><input type="hidden" name="back" value={backHref} /><input type="hidden" name="anchor" value={`p-${p.pid}`} /><SubmitButton className={btn} pendingText="جارٍ الاستيراد…">استيراد إلى تربح</SubmitButton></form></AccessBoundary>}
              <Link href={`${backHref}&detail=${encodeURIComponent(p.pid)}#cj-detail`} className={ghost}>تفاصيل</Link>
            </div>
          </div>
        ))}
        {listing.ok && !items.length && <p className="col-span-full rounded-lg bg-white p-6 text-center text-sm text-muted-foreground">لا نتائج{q ? ` للبحث «${q}»` : ''}.</p>}
      </div>

      {/* صفحات — تنقّل كامل + قفز لصفحة */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href={pageHref(1)} aria-disabled={page <= 1} className={`${ghost} ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>« الأولى</Link>
        <Link href={pageHref(page - 1)} aria-disabled={page <= 1} className={`${ghost} ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>السابقة</Link>
        <form method="get" className="flex items-center gap-1">
          {q && <input type="hidden" name="q" value={q} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
          <input className={`${input} w-16 text-center`} name="page" type="number" min={1} max={totalPages} defaultValue={page} aria-label="رقم الصفحة" />
          <span className="text-sm text-muted-foreground">/ {totalPages.toLocaleString('en')}</span>
          <button className={btn}>اذهب</button>
        </form>
        <Link href={pageHref(page + 1)} aria-disabled={page >= totalPages} className={`${ghost} ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>التالية</Link>
        <Link href={pageHref(totalPages)} aria-disabled={page >= totalPages} className={`${ghost} ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>الأخيرة »</Link>
      </div>

      {/* تفاصيل منتج مختار */}
      {detailPid && (
        <div id="cj-detail" className={`${card} scroll-mt-20 ring-2 ring-primary/30`}>
          <div className="flex items-center justify-between"><h2 className="font-bold">تفاصيل المنتج · {detailPid}</h2><Link href={backHref} className={ghost}>إغلاق</Link></div>
          {detail && detail.ok ? (
            <div className="space-y-3 text-sm">
              <div className="font-bold leading-6">{arOf(detail.data.name)}</div>
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النصوص الأصلية من المصدر</summary><p dir="auto">{detail.data.name}</p><p dir="auto">{detail.data.category}</p><ul>{detail.data.variants.map(v => <li key={v.vid}><code>{v.sku}</code> — <span dir="auto">{v.name}</span></li>)}</ul></details>
              <div className="flex flex-wrap gap-1">{detail.data.images.slice(0, 6).map((src, i) => (
                <CjProductImage key={i} src={cjImg(src)} alt={arOf(detail.data.name)} className="h-16 w-16 rounded object-cover" />
              ))}</div>
              {/* القيم الحقيقية الحيّة من CJ — الأصل: السعر والشحن والمخزون */}
              {detailLive?.status === 'available' ? (
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-3">
                  <div className="mb-2 text-xs font-extrabold text-emerald-900">✓ قيم حقيقية حيّة من CJ (تم التحقق الآن)</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-white p-2"><div className="text-[11px] text-muted-foreground">السعر</div><div className="text-base font-extrabold text-primary">{sar(detailLive.salePriceMinor)}</div><div className="text-[10px] text-muted-foreground" dir="ltr">تكلفة {usd(liveVariant!.priceUsd)}</div></div>
                    <div className="rounded-lg bg-white p-2"><div className="text-[11px] text-muted-foreground">الشحن الحيّ</div><div className="font-bold text-emerald-800">{liveShip ? ((liveShip.priceMinor + liveShip.additionalMinor) === 0 ? 'مجاني' : sar(liveShip.priceMinor + liveShip.additionalMinor)) : '—'}</div>{liveShip?.deliveryDays && <div className="text-[10px] text-muted-foreground">{liveShip.deliveryDays}</div>}</div>
                    <div className="rounded-lg bg-white p-2"><div className="text-[11px] text-muted-foreground">المخزون</div><div className="font-bold text-emerald-800">{detailLive.stockQuantity.toLocaleString('en')}</div></div>
                    <div className="rounded-lg border border-emerald-400 bg-emerald-100/60 p-2"><div className="text-[11px] text-emerald-900">الإجمالي (سعر + شحن)</div><div className="text-base font-extrabold text-emerald-900">{sar(detailLive.salePriceMinor + (liveShip ? liveShip.priceMinor + liveShip.additionalMinor : 0))}</div></div>
                  </div>
                  <div className="mt-2 rounded-lg bg-primary/5 p-2 text-sm"><span className="text-[11px] text-muted-foreground">القسم الجديد</span> <span className="font-bold" dir="auto">{arOf(detail.data.category)}</span></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-primary/5 p-2"><div className="text-[11px] text-muted-foreground">سعر CJ</div><div className="font-bold" dir="ltr">{usd(detail.data.priceUsd)}</div></div>
                    <div className="rounded-lg bg-primary/5 p-2 col-span-2"><div className="text-[11px] text-muted-foreground">القسم الجديد</div><div className="font-bold" dir="auto">{arOf(detail.data.category)}</div></div>
                  </div>
                  <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-900">تعذّر جلب الشحن/المخزون الحيّ الآن{detailLive ? ` (${detailLive.status})` : ''} — قد يكون الخيار غير متوفّر أو لا شحن للسعودية، أو حدّ طلبات CJ. أعد فتح التفاصيل بعد لحظات.</p>
                </div>
              )}
              {/* المتغيّرات — بطاقات بسطرين بلا تمرير أفقي */}
              {detail.data.variants.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-600">المتغيّرات ({detail.data.variants.length})</div>
                  {detail.data.variants.map((v) => (
                    <div key={v.vid} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                      <div className="font-semibold" dir="auto">{v.name ? <CjText original={v.name} ar={detailVariantAr.get(v.name.trim())} /> : '—'}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span>سعر البيع: <b className="text-primary">{sar(salePreview(v.priceUsd))}</b></span>
                        <span>الوزن: <b>{v.weight != null ? `${v.weight} غ` : '—'}</b></span>
                        <span>المخزون (عيّنة): <b>{v.stock ?? '—'}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : <p className="text-sm text-red-700">تعذّر جلب تفاصيل المنتج الآن. أعد المحاولة لاحقًا.</p>}
        </div>
      )}

      {/* البضائع المستوردة — في صفحة فرعية مستقلة لوضوح الهدف (لا تزدحم صفحة التصفّح) */}
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div>
          <h2 className="font-bold">البضائع المستوردة: {importedList.length}</h2>
          <p className="text-xs text-muted-foreground">إدارة الأسماء والأسعار والترجمة والإخفاء والحذف في صفحة مستقلة.</p>
        </div>
        <Link href="/admin/suppliers/cj/imported" className={btn}>إدارة البضائع المستوردة ←</Link>
      </div>
    </div>
  );
}
