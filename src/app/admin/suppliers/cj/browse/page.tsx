import { AccessBoundary } from '@/components/access-boundary';
import { CjProductImage } from '@/components/cj/product-image';
import Link from 'next/link';
import { requireAccess } from '@/lib/access-control/guards';
import { cjConfig } from '@/lib/cj/config';
import { listProductsPage, getCategories } from '@/lib/cj/client';
import { translateArabicCjSearch } from '@/lib/cj/search';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { importedCjPids, listCjProducts, parseCjAvailability } from '@/lib/cj/mapping';
import { cjSyncSettings } from '@/lib/cj/sync';
import { defaultMarginBps, computePrice } from '@/lib/cj/pricing';
import { getCachedArabic, isArabicText, DEFAULT_LIBRETRANSLATE_URL } from '@/lib/cj/translate';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { importCjProduct, removeCjProduct, saveCjArabic, saveCjPrice, toggleCjHidden, translateCjProduct, translateCjBrowsePage, translateAllCj, translateCjCategories, runCjTranslateWarm, refreshCjMediaAction, refreshCjImportedAvailability, saveCjTranslationSettings } from '../actions';
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
  const listing = await listProductsPage(page, PAGE_SIZE, { productName: sourceQuery || q || undefined, categoryId: cat || undefined });
  const items = listing.ok ? listing.data.items : [];
  // صلاحية العرض تقرأ الترجمات المحفوظة فقط؛ الترجمة والكتابة إجراءات تحرير صريحة.
  const importedList = await listCjProducts(60);
  const titleTexts = items.map((p) => p.productName);
  const cardCats = items.map((p) => p.categoryName ?? '').filter(Boolean);
  const catNames = categories.flatMap(c => [c.name, c.path, ...c.path.split(/\s*[›>]\s*/)]);
  const [gridAr, catAr] = await Promise.all([
    getCachedArabic([...titleTexts, ...cardCats, ...importedList.flatMap(r => [r.name, r.trbhh_category])]),
    getCachedArabic(catNames),
  ]);
  const arText = (t: string | null | undefined) => {
    if (!t) return '—';
    if (isArabicText(t)) return t;
    const saved = gridAr.get(t.trim()) ?? catAr.get(t.trim());
    return isArabicText(saved) ? saved! : 'الترجمة العربية غير متاحة';
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
  // تفاصيل المصدر قد تُقرأ من CJ؛ لا اتصال بمزوّد ترجمة ولا كتابة أثناء GET.
  const detailAr = detail && detail.ok
    ? await getCachedArabic([detail.data.name, detail.data.category ?? '', ...detail.data.variants.map((v) => v.name ?? '')])
    : new Map<string, string>();
  const arOf = (t: string | null | undefined) => t && isArabicText(detailAr.get(t.trim())) ? detailAr.get(t.trim())! : arText(t);
  const salePreview = (u: number | null) => (u != null && u > 0 ? computePrice(Math.round(u * settings.usdToSarX100), settings.shippingMinor, 0, marginBps).salePriceMinor : null);
  const keep = `${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`;
  const pageHref = (n: number) => `/admin/suppliers/cj/browse?page=${Math.min(Math.max(1, n), totalPages)}${keep}`;
  const backHref = `/admin/suppliers/cj/browse?page=${page}${keep}`;
  const activeCat = categories.find((c) => c.id === cat);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">تصفّح منتجات CJ واستيرادها</h1>
        <Link href="/admin/suppliers/cj" className={ghost}>لوحة CJ (اختبار/إعدادات)</Link>
      </div>
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

      {/* بحث + فلترة بالتصنيف (بالعربية عند توفّر الترجمة) */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-sm">بحث بالاسم<input className={`${input} ms-2 w-56`} name="q" defaultValue={q} placeholder="اكتب اسم المنتج بالعربية أو الإنجليزية" /></label>
        <label className="text-sm">التصنيف
          <select name="cat" defaultValue={cat} className={`${input} ms-2 w-72`}>
            <option value="">كل التصنيفات{total ? ` (${total.toLocaleString('en')})` : ''}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabels.get(c.id)}</option>)}
          </select>
        </label>
        <button className={btn}>عرض</button>
        {(q || cat) && <Link href="/admin/suppliers/cj/browse" className={ghost}>مسح الفلاتر</Link>}
      </form>
      {q && /\p{Script=Arabic}/u.test(q) && <p role="status" className="text-xs text-muted-foreground">{sourceQuery ? 'تم البحث عن الاسم العربي باستخدام اسمه في مصدر CJ.' : 'تعذّرت ترجمة عبارة البحث الآن؛ أعد المحاولة أو ابحث بالاسم كما يظهر في المصدر.'}</p>}
      {categories.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-bold">أسماء التصنيفات الأصلية من المصدر</summary><ul className="mt-2 space-y-1">{categories.map((c, index) => <li key={c.id}>التصنيف {index + 1}: <span dir="auto">{c.path}</span> — <code>{c.id}</code></li>)}</ul></details>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">تُعرض الترجمات العربية المحفوظة. الترجمة الجديدة تتطلب إجراءً صريحًا بصلاحية التحرير.</span>
        <AccessBoundary module="products" action="edit"><form action={translateCjBrowsePage}>
          <input type="hidden" name="page" value={page} /><input type="hidden" name="q" value={q} /><input type="hidden" name="cat" value={cat} />
          {detailPid && <input type="hidden" name="detail" value={detailPid} />}
          <input type="hidden" name="back" value={`${backHref}${detailPid ? `&detail=${encodeURIComponent(detailPid)}` : ''}`} />
          <button className={btn} disabled={!items.length}>ترجمة منتجات هذه الصفحة</button>
        </form></AccessBoundary>
        <AccessBoundary module="products" action="edit"><form action={translateCjCategories}><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة كل التصنيفات الآن</button></form></AccessBoundary>
        <AccessBoundary module="products" action="edit"><form action={runCjTranslateWarm}><input type="hidden" name="back" value={backHref} /><button className={ghost}>تحديث الترجمات (خادم)</button></form></AccessBoundary>
        <AccessBoundary module="products" action="edit"><form action={refreshCjMediaAction}><input type="hidden" name="back" value={backHref} /><button className={ghost}>تحديث الصور</button></form></AccessBoundary>
        {typeof sp.mediaref === 'string' && <span className="text-emerald-700">حُدّثت صور {sp.mediaref} سلعة.</span>}
        {typeof sp.cattr === 'string' && <span className="text-emerald-700">خُزّنت ترجمة {sp.cattr} تصنيفاً (اضغط ثانيةً للباقي).</span>}
        {typeof sp.warmed === 'string' && <span className="text-emerald-700">تم تحديث الترجمات على الخادم ({sp.warmed}).</span>}
        {sp.transcfg === '1' && <span className="text-emerald-700">حُفظت إعدادات مزوّد الترجمة.</span>}
      </div>
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
          <button className={btn}>حفظ إعدادات الترجمة</button>
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

      {/* شبكة المنتجات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div key={p.pid} className={card}>
            <CjProductImage src={cjImg(p.productImage)} alt={arText(p.productName)} className="h-36 w-full rounded-lg object-cover" />
            <div className="text-sm font-bold leading-5 line-clamp-2">{arText(p.productName)}</div>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النص الأصلي من المصدر</summary><p dir="auto">{p.productName}</p>{p.categoryName && <p dir="auto">{p.categoryName}</p>}</details>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>PID: <span dir="ltr">{p.pid}</span></span>
              <span>SKU: <span dir="ltr">{p.productSku || '—'}</span></span>
              <span>التصنيف: {arText(p.categoryName)}</span>
              <span>سعر CJ: {usd(p.sellPrice)}</span>
            </div>
            <div className="text-sm font-extrabold text-primary">بيع تقديري: {sar(salePreview(p.sellPrice))}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              {imported.has(p.pid)
                ? <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">مستورد ✓</span>
                : <AccessBoundary module="products" action="create"><form action={importCjProduct}><input type="hidden" name="pid" value={p.pid} /><input type="hidden" name="back" value={backHref} /><button className={btn}>استيراد إلى تربح</button></form></AccessBoundary>}
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
              {/* أهم الحقائق بوضوح */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-primary/5 p-2"><div className="text-[11px] text-muted-foreground">سعر البيع (بعد التحويل)</div><div className="text-base font-extrabold text-primary">{sar(salePreview(detail.data.priceUsd))}</div></div>
                <div className="rounded-lg bg-primary/5 p-2"><div className="text-[11px] text-muted-foreground">الشحن التقديري</div><div className="font-bold">{sar(settings.shippingMinor)}</div></div>
                <div className="rounded-lg bg-primary/5 p-2"><div className="text-[11px] text-muted-foreground">سعر CJ</div><div className="font-bold">{usd(detail.data.priceUsd)}</div></div>
                <div className="rounded-lg bg-primary/5 p-2 col-span-2"><div className="text-[11px] text-muted-foreground">التصنيف الجديد</div><div className="font-bold">{arOf(detail.data.category)}</div></div>
                <div className="rounded-lg bg-primary/5 p-2"><div className="text-[11px] text-muted-foreground">المخزون (عيّنة)</div><div className="font-bold">{detail.data.totalStock.toLocaleString('en')}</div></div>
              </div>
              {/* المتغيّرات — مبسّطة ومترجمة */}
              {detail.data.variants.length > 0 && (
                <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-right text-xs"><thead className="bg-primary/5"><tr>{['المتغيّر', 'سعر البيع', 'الوزن(غ)', 'المخزون'].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
                  {detail.data.variants.map((v) => <tr key={v.vid} className="border-t"><td className="p-2">{arOf(v.name)}</td><td className="p-2 font-bold text-primary">{sar(salePreview(v.priceUsd))}</td><td className="p-2">{v.weight ?? '—'}</td><td className="p-2">{v.stock ?? '—'}</td></tr>)}
                </tbody></table></div>
              )}
            </div>
          ) : <p className="text-sm text-red-700">تعذّر جلب تفاصيل المنتج الآن. أعد المحاولة لاحقًا.</p>}
        </div>
      )}

      {/* المنتجات المستوردة — إدارة كاملة */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">البضائع المستوردة (تخزين وسيط — غير معروضة للعامة): {importedList.length}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/suppliers/cj/showcase" className={btn}>معاينة السلع المختارة ←</Link>
            <AccessBoundary module="products" action="edit"><form action={translateAllCj}><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة تلقائية للكل</button></form></AccessBoundary>
          </div>
        </div>
        {typeof sp.edited === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم الحفظ.</p>}
        {typeof sp.translated === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تمّت ترجمة {sp.translated} سلعة تلقائياً.</p>}
        {!importedList.length ? <p className="text-sm text-muted-foreground">لم تستورد أي منتج بعد.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {importedList.map((r) => {
              const finalMinor = r.sale_price_override_minor ?? r.sale_price_minor;
              const availability = parseCjAvailability(r);
              return (
                <div key={r.id} className={`rounded-xl border p-3 space-y-2 ${r.hidden ? 'border-slate-300 bg-slate-50 opacity-80' : 'border-primary/20'}`}>
                  <div className="flex gap-3">
                    <CjProductImage src={cjImg(cjProductImages(r)[0])} alt={isArabicText(r.name_ar) ? r.name_ar : arText(r.name)} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-sm font-bold">{isArabicText(r.name_ar) ? r.name_ar : arText(r.name)}</div>
                      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النص الأصلي من المصدر</summary><p dir="auto">{r.name}</p><p dir="auto">{r.trbhh_category}</p></details>
                      <div className="text-[11px] text-muted-foreground"><span dir="ltr">PID {r.cj_product_id}</span> · التكلفة {sar(r.supplier_cost_minor + r.shipping_cost_minor)}</div>
                      <div className="text-sm font-extrabold text-primary">السعر: {sar(finalMinor)}{r.sale_price_override_minor != null && <span className="ms-1 text-[10px] font-normal text-amber-700">(معدّل يدوياً)</span>}</div>
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {r.trbhh_category && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">{arText(r.trbhh_category)}</span>}
                        <span className={`rounded px-1.5 py-0.5 font-bold ${r.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status === 'ready' ? 'جاهزة' : 'مسودّة'}</span>
                        {r.hidden === 1 && <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">مخفية</span>}
                      </div>
                      {availability
                        ? <p className="text-xs font-bold text-emerald-800">مخزون متحقق: {availability.stockQuantity.toLocaleString('en')} · خيارات الشحن: {availability.shippingOptions.length}</p>
                        : <p className="text-xs font-bold text-amber-800">المخزون أو الشحن غير متحقق حديثًا؛ لن يظهر الإعلان للعامة.</p>}
                    </div>
                  </div>
                  {/* تحرير العنوان العربي */}
                  <AccessBoundary module="products" action="edit"><form action={saveCjArabic} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} />
                    <input className={`${input} flex-1`} name="nameAr" defaultValue={r.name_ar} placeholder="العنوان بالعربية" />
                    <button className={btn}>حفظ</button>
                  </form></AccessBoundary>
                  <div className="flex flex-wrap items-center gap-1">
                    <Link href={`/admin/suppliers/cj/review/${r.id}`} className={btn}>مراجعة / تحرير</Link>
                    <AccessBoundary module="products" action="edit"><form action={refreshCjImportedAvailability}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className={ghost}>تحديث الصور والمخزون والشحن</button></form></AccessBoundary>
                    {/* تعديل السعر */}
                    <AccessBoundary module="products" action="edit"><form action={saveCjPrice} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} />
                      <input className={`${input} w-24`} name="priceSar" inputMode="decimal" defaultValue={r.sale_price_override_minor != null ? (r.sale_price_override_minor / 100).toString() : ''} placeholder={(r.sale_price_minor / 100).toString()} aria-label="سعر البيع بالريال" />
                      <button className={ghost}>سعر</button>
                    </form></AccessBoundary>
                    {/* ترجمة تلقائية لهذه السلعة */}
                    <AccessBoundary module="products" action="edit"><form action={translateCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة</button></form></AccessBoundary>
                    {/* إخفاء/إظهار */}
                    <AccessBoundary module="products" action="suspend"><form action={toggleCjHidden}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hidden" value={r.hidden ? '0' : '1'} /><input type="hidden" name="back" value={backHref} /><button className={ghost}>{r.hidden ? 'إظهار' : 'إخفاء'}</button></form></AccessBoundary>
                    {/* حذف */}
                    <AccessBoundary module="products" action="delete"><form action={removeCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700">حذف</button></form></AccessBoundary>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
