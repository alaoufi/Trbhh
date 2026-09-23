import Link from 'next/link';
import { requireAccess } from '@/lib/access-control/guards';
import { cjConfig } from '@/lib/cj/config';
import { listProducts } from '@/lib/cj/client';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { importedCjPids, listCjProducts } from '@/lib/cj/mapping';
import { cjSyncSettings } from '@/lib/cj/sync';
import { defaultMarginBps, computePrice } from '@/lib/cj/pricing';
import { importCjProduct, removeCjProduct, addCjShortlistSelection, setCjShortlistStatus, removeCjShortlistSelection } from '../actions';
import { listCjShortlist, CJ_SHORTLIST_STATUSES, CJ_SHORTLIST_STATUS_LABELS } from '@/lib/cj/shortlist';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تصفّح منتجات CJ واستيرادها' };

const PAGE_SIZE = 12;
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
  const category = typeof sp.category === 'string' ? sp.category.slice(0, 120) : '';
  const minUsd = typeof sp.minUsd === 'string' && sp.minUsd.trim() !== '' ? Number(sp.minUsd) : null;
  const maxUsd = typeof sp.maxUsd === 'string' && sp.maxUsd.trim() !== '' ? Number(sp.maxUsd) : null;
  const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1') || 1);
  const detailPid = typeof sp.detail === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(sp.detail) ? sp.detail : '';
  const cfg = cjConfig();

  if (!cfg.configured) {
    return <div className="space-y-3"><h1 className="text-xl font-extrabold text-primary">تصفّح منتجات CJ</h1><p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm">اضبط متغيّرات CJ (البريد والمفتاح) في بيئة الخادم أولاً.</p></div>;
  }

  const [settings, marginBps] = await Promise.all([cjSyncSettings(), defaultMarginBps()]);
  const listing = await listProducts(page, PAGE_SIZE, { productName: q || undefined });
  const rawItems = listing.ok ? listing.data : [];
  const categories = [...new Set(rawItems.map((p) => p.categoryName).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  const items = rawItems.filter((p) => {
    if (category && p.categoryName !== category) return false;
    if (minUsd != null && Number.isFinite(minUsd) && (p.sellPrice == null || p.sellPrice < minUsd)) return false;
    if (maxUsd != null && Number.isFinite(maxUsd) && (p.sellPrice == null || p.sellPrice > maxUsd)) return false;
    return true;
  });
  const imported = items.length ? await importedCjPids(items.map((p) => p.pid)) : new Set<string>();
  const detail = detailPid ? await sampleOneCjProduct(detailPid) : null;
  const [importedList, shortlist] = await Promise.all([listCjProducts(60), listCjShortlist(120)]);
  const salePreview = (u: number | null) => (u != null && u > 0 ? computePrice(Math.round(u * settings.usdToSarX100), settings.shippingMinor, 0, marginBps).salePriceMinor : null);
  const backHref = `/admin/suppliers/cj/browse?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}${minUsd != null && Number.isFinite(minUsd) ? `&minUsd=${encodeURIComponent(String(minUsd))}` : ''}${maxUsd != null && Number.isFinite(maxUsd) ? `&maxUsd=${encodeURIComponent(String(maxUsd))}` : ''}`;

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
      {typeof sp.shortlisted === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">أُضيف {sp.shortlisted} منتج إلى قائمة التفاوض{Number(sp.shortlistFailed || 0) ? `، وتعذّر جلب ${sp.shortlistFailed}` : ''}.</p>}
      {sp.statusUpdated === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم تحديث مرحلة المنتج في قائمة التفاوض.</p>}
      {sp.shortlistRemoved === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تمت إزالة المنتج من قائمة التفاوض.</p>}
      {typeof sp.imperr === 'string' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الاستيراد: {sp.imperr}</p>}
      {sp.removed === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حذف المنتج من التخزين الوسيط.</p>}
      {!listing.ok && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر جلب المنتجات من CJ: {listing.error}{listing.status ? ` (HTTP ${listing.status})` : ''}</p>}

      {/* بحث وفلاتر اختيار المنتجات */}
      <form method="get" className="grid gap-2 rounded-xl border border-primary/15 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-bold">المورد
          <select className={`${input} mt-1 w-full`} disabled><option>CJdropshipping</option></select>
        </label>
        <label className="text-xs font-bold">البائع / المصدر
          <select className={`${input} mt-1 w-full`} disabled><option>غير مكشوف في CJ API</option></select>
        </label>
        <label className="text-xs font-bold">التصنيف الرئيسي
          <select className={`${input} mt-1 w-full`} name="category" defaultValue={category}>
            <option value="">الكل</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">بحث المنتج
          <input className={`${input} mt-1 w-full`} name="q" defaultValue={q} placeholder="اسم أو كلمة مفتاحية" />
        </label>
        <label className="text-xs font-bold">أقل سعر CJ ($)
          <input className={`${input} mt-1 w-full`} name="minUsd" inputMode="decimal" defaultValue={minUsd ?? ''} />
        </label>
        <label className="text-xs font-bold">أعلى سعر CJ ($)
          <input className={`${input} mt-1 w-full`} name="maxUsd" inputMode="decimal" defaultValue={maxUsd ?? ''} />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button className={btn}>تطبيق الفلاتر</button>
          <Link href="/admin/suppliers/cj/browse" className={ghost}>مسح</Link>
        </div>
      </form>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
        <b>تسلسل الاختيار:</b> المورد ← البائع/المصدر ← التصنيف ← المنتجات. CJ لا يعيد حالياً حقلاً مستقلاً للبائع في التكامل الحالي،
        لذلك لا ننشئ اسم بائع افتراضياً. التصنيفات المعروضة هي القيم الحقيقية المرجعة في صفحة CJ الحالية.
      </div>

      <form id="cj-shortlist-form" action={addCjShortlistSelection}>
        <input type="hidden" name="back" value={backHref} />
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <span className="text-sm font-bold">حدّد المنتجات المناسبة ثم أضفها إلى قائمة التفاوض مع المورد.</span>
        <button form="cj-shortlist-form" className={btn}>إضافة المحدد إلى قائمة التفاوض</button>
      </div>

      {/* شبكة المنتجات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div key={p.pid} className={card}>
            <label className="flex items-center gap-2 rounded-lg bg-primary/5 p-2 text-xs font-bold">
              <input type="checkbox" name="pid" value={p.pid} form="cj-shortlist-form" className="h-4 w-4" />
              اختيار للتفاوض
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.productImage ? <img src={p.productImage} alt="" className="h-36 w-full rounded-lg object-cover" loading="lazy" /> : <div className="flex h-36 w-full items-center justify-center rounded-lg bg-primary/5 text-xs text-muted-foreground">لا صورة</div>}
            <div className="text-sm font-bold leading-5 line-clamp-2">{p.productName || '—'}</div>
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
              <Link href={`${backHref}&detail=${encodeURIComponent(p.pid)}`} className={ghost}>تفاصيل</Link>
            </div>
          </div>
        ))}
        {listing.ok && !items.length && <p className="col-span-full rounded-lg bg-white p-6 text-center text-sm text-muted-foreground">لا نتائج{q ? ` للبحث «${q}»` : ''}.</p>}
      </div>

      {/* صفحات */}
      <div className="flex items-center justify-between">
        <Link href={`/admin/suppliers/cj/browse?page=${Math.max(1, page - 1)}${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-disabled={page <= 1} className={`${ghost} ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>الصفحة السابقة</Link>
        <span className="text-sm text-muted-foreground">صفحة {page}</span>
        <Link href={`/admin/suppliers/cj/browse?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-disabled={items.length < PAGE_SIZE} className={`${ghost} ${items.length < PAGE_SIZE ? 'pointer-events-none opacity-40' : ''}`}>الصفحة التالية</Link>
      </div>

      {/* تفاصيل منتج مختار */}
      {detailPid && (
        <div className={card}>
          <div className="flex items-center justify-between"><h2 className="font-bold">تفاصيل المنتج · {detailPid}</h2><Link href={backHref} className={ghost}>إغلاق</Link></div>
          {detail && detail.ok ? (
            <div className="space-y-2 text-sm">
              <div className="font-bold">{detail.data.name}</div>
              <div className="flex flex-wrap gap-1">{detail.data.images.slice(0, 6).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-16 w-16 rounded object-cover" loading="lazy" />
              ))}</div>
              <div className="text-xs text-muted-foreground">التصنيف: {detail.data.category || '—'} · سعر CJ: {usd(detail.data.priceUsd)} · إجمالي المخزون (عيّنة): {detail.data.totalStock}</div>
              <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-right text-xs"><thead className="bg-primary/5"><tr>{['المتغيّر', 'SKU', 'سعر $', 'وزن(غ)', 'مخزون'].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
                {detail.data.variants.map((v) => <tr key={v.vid} className="border-t"><td className="p-2">{v.name || '—'}</td><td className="p-2" dir="ltr">{v.sku}</td><td className="p-2">{usd(v.priceUsd)}</td><td className="p-2">{v.weight ?? '—'}</td><td className="p-2">{v.stock ?? '—'}</td></tr>)}
                {!detail.data.variants.length && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">لا متغيّرات.</td></tr>}
              </tbody></table></div>
            </div>
          ) : <p className="text-sm text-red-700">تعذّر جلب التفاصيل{detail && !detail.ok ? `: ${detail.error}` : ''}.</p>}
        </div>
      )}

      {/* قائمة الاختيار والتفاوض */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">قائمة التفاوض مع المورد: {shortlist.length}</h2>
          <span className="text-xs text-muted-foreground">هذه القائمة مستقلة عن الاستيراد والنشر.</span>
        </div>
        {!shortlist.length ? <p className="text-sm text-muted-foreground">لم تُضف منتجات للتفاوض بعد.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-right text-xs"><thead className="bg-primary/5"><tr>{['المنتج', 'SKU / PID', 'التصنيف', 'تكلفة CJ', 'شحن تقديري', 'بيع تقديري', 'المرحلة', 'إجراء'].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
            {shortlist.map((row) => <tr key={String(row.id)} className="border-t align-top">
              <td className="p-2"><div className="flex items-center gap-2">
                {row.image ? <img src={row.image} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" /> : null}
                <span className="max-w-[260px] font-bold">{row.name || '—'}</span>
              </div></td>
              <td className="p-2" dir="ltr"><div>{row.cj_sku || '—'}</div><div className="text-muted-foreground">{row.cj_product_id}</div></td>
              <td className="p-2">{row.category_name || '—'}</td>
              <td className="p-2">{sar(row.supplier_cost_minor)}</td>
              <td className="p-2">{sar(row.shipping_cost_minor)}</td>
              <td className="p-2 font-bold text-primary">{sar(row.sale_price_minor)}</td>
              <td className="p-2">
                <form action={setCjShortlistStatus} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={String(row.id)} />
                  <input type="hidden" name="back" value={backHref} />
                  <select name="status" defaultValue={row.status} className={input}>
                    {CJ_SHORTLIST_STATUSES.map((status) => <option key={status} value={status}>{CJ_SHORTLIST_STATUS_LABELS[status]}</option>)}
                  </select>
                  <button className={ghost}>حفظ</button>
                </form>
              </td>
              <td className="p-2">
                <form action={removeCjShortlistSelection}>
                  <input type="hidden" name="id" value={String(row.id)} />
                  <input type="hidden" name="back" value={backHref} />
                  <button className="rounded-lg border border-red-300 px-2 py-1 text-xs font-bold text-red-700">إزالة</button>
                </form>
              </td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {/* المنتجات المستوردة */}
      <div className={card}>
        <h2 className="font-bold">المنتجات المستوردة (تخزين وسيط — غير معروضة للعامة): {importedList.length}</h2>
        {!importedList.length ? <p className="text-sm text-muted-foreground">لم تستورد أي منتج بعد.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-right text-xs"><thead className="bg-primary/5"><tr>{['الاسم', 'SKU', 'PID', 'التكلفة', 'سعر البيع', ''].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
            {importedList.map((r) => <tr key={r.id} className="border-t">
              <td className="p-2">{r.name || '—'}</td><td className="p-2" dir="ltr">{r.cj_sku || '—'}</td><td className="p-2" dir="ltr">{r.cj_product_id}</td>
              <td className="p-2">{sar(r.supplier_cost_minor + r.shipping_cost_minor)}</td><td className="p-2 font-bold text-primary">{sar(r.sale_price_minor)}</td>
              <td className="p-2"><form action={removeCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backHref} /><button className="rounded-lg border border-red-300 px-2 py-1 text-xs font-bold text-red-700">حذف</button></form></td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
