import Link from 'next/link';
import { requireAccess } from '@/lib/access-control/guards';
import { cjConfig } from '@/lib/cj/config';
import { listProductsPage, getCategories } from '@/lib/cj/client';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { importedCjPids, listCjProducts } from '@/lib/cj/mapping';
import { cjSyncSettings } from '@/lib/cj/sync';
import { defaultMarginBps, computePrice } from '@/lib/cj/pricing';
import { getCachedArabic, translateManyCached } from '@/lib/cj/translate';
import { importCjProduct, removeCjProduct, saveCjArabic, saveCjPrice, toggleCjHidden, translateCjProduct, translateAllCj, translateCjCategories, runCjTranslateWarm } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تصفّح منتجات CJ واستيرادها' };

const PAGE_SIZE = 24;
const card = 'card-3d rounded-xl p-3 space-y-2';
const btn = 'rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40';
const ghost = 'rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary';
const input = 'min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
const sar = (m: number | null) => (m == null ? '—' : `${(m / 100).toFixed(2)} ر.س`);
const usd = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);

export default async function CjBrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('integrations', 'view');
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 100) : '';
  const cat = typeof sp.cat === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(sp.cat) ? sp.cat : '';
  const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1') || 1);
  const detailPid = typeof sp.detail === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(sp.detail) ? sp.detail : '';
  const cfg = cjConfig();

  if (!cfg.configured) {
    return <div className="space-y-3"><h1 className="text-xl font-extrabold text-primary">تصفّح منتجات CJ</h1><p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm">اضبط متغيّرات CJ (البريد والمفتاح) في بيئة الخادم أولاً.</p></div>;
  }

  const wantAr = sp.ar !== '0'; // الترجمة تلقائية افتراضياً (أوقفها بـ ar=0)
  const [settings, marginBps, catsRes] = await Promise.all([cjSyncSettings(), defaultMarginBps(), getCategories()]);
  const categories = catsRes.ok ? catsRes.data : [];
  const listing = await listProductsPage(page, PAGE_SIZE, { productName: q || undefined, categoryId: cat || undefined });
  const items = listing.ok ? listing.data.items : [];
  // ترجمة العناوين والتصنيفات للعربية تلقائياً قبل الاستيراد (تُخزَّن فتُصبح فورية لاحقاً؛
  // التصنيفات تُترجَم تدريجياً ٣٠ لكل تحميل حتى تكتمل الشجرة).
  const titleTexts = items.map((p) => p.productName);
  const catNames = categories.map((c) => c.name);
  const [gridAr, catAr] = await Promise.all([
    wantAr ? translateManyCached(titleTexts, 30) : getCachedArabic(titleTexts),
    wantAr ? translateManyCached(catNames, 30) : getCachedArabic(catNames),
  ]);
  const total = listing.ok ? listing.data.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const imported = items.length ? await importedCjPids(items.map((p) => p.pid)) : new Set<string>();
  const detail = detailPid ? await sampleOneCjProduct(detailPid) : null;
  // ترجمة حقول لوحة التفاصيل (اسم/تصنيف/أسماء المتغيّرات) — عند الطلب ومخزَّنة.
  const detailAr = detail && detail.ok
    ? await translateManyCached([detail.data.name, detail.data.category ?? '', ...detail.data.variants.map((v) => v.name ?? '')], 20)
    : new Map<string, string>();
  const arOf = (t: string | null | undefined) => (t ? detailAr.get(t) ?? t : '—');
  const importedList = await listCjProducts(60);
  const salePreview = (u: number | null) => (u != null && u > 0 ? computePrice(Math.round(u * settings.usdToSarX100), settings.shippingMinor, 0, marginBps).salePriceMinor : null);
  const keep = `${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}${wantAr ? '' : '&ar=0'}`;
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
      {typeof sp.imported === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم استيراد المنتج {sp.imported} إلى التخزين الوسيط ✓ (لم يُعرض للعامة).</p>}
      {typeof sp.imperr === 'string' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الاستيراد: {sp.imperr}</p>}
      {sp.removed === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حذف المنتج من التخزين الوسيط.</p>}
      {!listing.ok && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر جلب المنتجات من CJ: {listing.error}{listing.status ? ` (HTTP ${listing.status})` : ''}</p>}

      {/* بحث + فلترة بالتصنيف (بالعربية عند توفّر الترجمة) */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        {!wantAr && <input type="hidden" name="ar" value="0" />}
        <label className="text-sm">بحث بالاسم<input className={`${input} ms-2 w-56`} name="q" defaultValue={q} placeholder="مثال: jacket, shorts…" /></label>
        <label className="text-sm">التصنيف
          <select name="cat" defaultValue={cat} className={`${input} ms-2 w-72`}>
            <option value="">كل التصنيفات{total ? ` (${total.toLocaleString('en')})` : ''}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{catAr.get(c.name) ?? c.path}</option>)}
          </select>
        </label>
        <button className={btn}>عرض</button>
        {(q || cat) && <Link href="/admin/suppliers/cj/browse" className={ghost}>مسح الفلاتر</Link>}
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">الترجمة العربية تلقائية{wantAr ? ' (مفعّلة)' : ' (موقّفة)'}.</span>
        {wantAr
          ? <Link href={`/admin/suppliers/cj/browse?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}&ar=0`} className={ghost}>عرض بالإنجليزية</Link>
          : <Link href={`/admin/suppliers/cj/browse?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`} className={btn}>عرض بالعربية</Link>}
        <form action={translateCjCategories}><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة كل التصنيفات الآن</button></form>
        <form action={runCjTranslateWarm}><input type="hidden" name="back" value={backHref} /><button className={ghost}>تحديث الترجمات (خادم)</button></form>
        {typeof sp.cattr === 'string' && <span className="text-emerald-700">خُزّنت ترجمة {sp.cattr} تصنيفاً (اضغط ثانيةً للباقي).</span>}
        {typeof sp.warmed === 'string' && <span className="text-emerald-700">تم تحديث الترجمات على الخادم ({sp.warmed}).</span>}
      </div>
      {!categories.length && <p className="text-xs text-amber-700">تعذّر جلب شجرة التصنيفات من CJ الآن — البحث بالاسم يعمل، وأعد المحاولة لاحقاً.</p>}

      {/* ملخّص النتائج */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {listing.ok ? <>إجمالي المنتجات{activeCat ? ` في «${activeCat.name}»` : ''}{q ? ` للبحث «${q}»` : ''}: <b className="text-primary">{total.toLocaleString('en')}</b> · صفحة {page.toLocaleString('en')} من {totalPages.toLocaleString('en')}</> : '—'}
        </span>
      </div>

      {/* شبكة المنتجات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div key={p.pid} className={card}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.productImage ? <img src={p.productImage} alt="" className="h-36 w-full rounded-lg object-cover" loading="lazy" /> : <div className="flex h-36 w-full items-center justify-center rounded-lg bg-primary/5 text-xs text-muted-foreground">لا صورة</div>}
            {gridAr.get(p.productName)
              ? <><div className="text-sm font-bold leading-5 line-clamp-2">{gridAr.get(p.productName)}</div><div className="line-clamp-1 text-[11px] text-muted-foreground" dir="ltr">{p.productName}</div></>
              : <div className="text-sm font-bold leading-5 line-clamp-2" dir="ltr">{p.productName || '—'}</div>}
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>PID: <span dir="ltr">{p.pid}</span></span>
              <span>SKU: <span dir="ltr">{p.productSku || '—'}</span></span>
              <span>التصنيف: {p.categoryName || '—'}</span>
              <span>سعر CJ: {usd(p.sellPrice)}</span>
            </div>
            <div className="text-sm font-extrabold text-primary">بيع تقديري: {sar(salePreview(p.sellPrice))}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              {imported.has(p.pid)
                ? <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">مستورد ✓</span>
                : <form action={importCjProduct}><input type="hidden" name="pid" value={p.pid} /><input type="hidden" name="back" value={backHref} /><button className={btn}>استيراد إلى تربح</button></form>}
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
              <div className="flex flex-wrap gap-1">{detail.data.images.slice(0, 6).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-16 w-16 rounded object-cover" loading="lazy" />
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
          ) : <p className="text-sm text-red-700">تعذّر جلب التفاصيل{detail && !detail.ok ? `: ${detail.error}` : ''}.</p>}
        </div>
      )}

      {/* المنتجات المستوردة — إدارة كاملة */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">البضائع المستوردة (تخزين وسيط — غير معروضة للعامة): {importedList.length}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/suppliers/cj/showcase" className={btn}>معاينة السلع المختارة ←</Link>
            <form action={translateAllCj}><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة تلقائية للكل</button></form>
          </div>
        </div>
        {typeof sp.edited === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم الحفظ.</p>}
        {typeof sp.translated === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تمّت ترجمة {sp.translated} سلعة تلقائياً.</p>}
        {!importedList.length ? <p className="text-sm text-muted-foreground">لم تستورد أي منتج بعد.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {importedList.map((r) => {
              const finalMinor = r.sale_price_override_minor ?? r.sale_price_minor;
              return (
                <div key={r.id} className={`rounded-xl border p-3 space-y-2 ${r.hidden ? 'border-slate-300 bg-slate-50 opacity-80' : 'border-primary/20'}`}>
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image ? <img src={r.image} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-primary/5 text-[10px] text-muted-foreground">لا صورة</div>}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-sm font-bold">{r.name_ar || <span className="text-amber-700">— بلا عنوان عربي —</span>}</div>
                      <div className="truncate text-xs text-muted-foreground" dir="ltr">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground"><span dir="ltr">PID {r.cj_product_id}</span> · التكلفة {sar(r.supplier_cost_minor + r.shipping_cost_minor)}</div>
                      <div className="text-sm font-extrabold text-primary">السعر: {sar(finalMinor)}{r.sale_price_override_minor != null && <span className="ms-1 text-[10px] font-normal text-amber-700">(معدّل يدوياً)</span>}</div>
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {r.trbhh_category && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">{r.trbhh_category}</span>}
                        <span className={`rounded px-1.5 py-0.5 font-bold ${r.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status === 'ready' ? 'جاهزة' : 'مسودّة'}</span>
                        {r.hidden === 1 && <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">مخفية</span>}
                      </div>
                    </div>
                  </div>
                  {/* تحرير العنوان العربي */}
                  <form action={saveCjArabic} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} />
                    <input className={`${input} flex-1`} name="nameAr" defaultValue={r.name_ar} placeholder="العنوان بالعربية" />
                    <button className={btn}>حفظ</button>
                  </form>
                  <div className="flex flex-wrap items-center gap-1">
                    <Link href={`/admin/suppliers/cj/review/${r.id}`} className={btn}>مراجعة / تحرير</Link>
                    {/* تعديل السعر */}
                    <form action={saveCjPrice} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} />
                      <input className={`${input} w-24`} name="priceSar" inputMode="decimal" defaultValue={r.sale_price_override_minor != null ? (r.sale_price_override_minor / 100).toString() : ''} placeholder={(r.sale_price_minor / 100).toString()} aria-label="سعر البيع بالريال" />
                      <button className={ghost}>سعر</button>
                    </form>
                    {/* ترجمة تلقائية لهذه السلعة */}
                    <form action={translateCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className={ghost}>ترجمة</button></form>
                    {/* إخفاء/إظهار */}
                    <form action={toggleCjHidden}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hidden" value={r.hidden ? '0' : '1'} /><input type="hidden" name="back" value={backHref} /><button className={ghost}>{r.hidden ? 'إظهار' : 'إخفاء'}</button></form>
                    {/* حذف */}
                    <form action={removeCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700">حذف</button></form>
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
