import Link from 'next/link';
import { AccessBoundary } from '@/components/access-boundary';
import { CjProductImage } from '@/components/cj/product-image';
import { CjText } from '@/components/cj/cj-text';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { SubmitButton } from '@/components/cj/submit-button';
import { requireAccess } from '@/lib/access-control/guards';
import { listCjProducts, parseCjAvailability } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { translateManyCached, isArabicText } from '@/lib/cj/translate';
import { saveCjArabic, saveCjPrice, toggleCjHidden, translateCjProduct, translateAllCj, refreshCjImportedAvailability, removeCjProduct } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'البضائع المستوردة من CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40';
const ghost = 'rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary';
const input = 'min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
const sar = (m: number | null) => (m == null ? '—' : `${(m / 100).toFixed(2)} ر.س`);
const BACK = '/admin/suppliers/cj/imported';

export default async function CjImportedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const importedList = await listCjProducts(200);
  // ترجمة فورية عند التحميل لأسماء السلع غير العربية عبر المترجم المحلي ثم تُخزَّن.
  const ar = await translateManyCached(importedList.flatMap((r) => [r.name, r.trbhh_category]), 120);
  const nameOf = (r: { name: string; name_ar: string }) => isArabicText(r.name_ar) ? r.name_ar : (ar.get((r.name || '').trim()) ?? null);

  return (
    <div className="space-y-4">
      <CjAdminNav current="imported" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">البضائع المستوردة (تخزين وسيط — غير معروضة للعامة): {importedList.length}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/suppliers/cj/browse" className={ghost}>تصفّح واستيراد ←</Link>
          <Link href="/admin/suppliers/cj/showcase" className={ghost}>السلع المعروضة ←</Link>
          <AccessBoundary module="products" action="edit"><form action={translateAllCj}><input type="hidden" name="back" value={BACK} /><SubmitButton className={ghost} pendingText="جارٍ الترجمة…">ترجمة تلقائية للكل</SubmitButton></form></AccessBoundary>
        </div>
      </div>
      {typeof sp.edited === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم الحفظ.</p>}
      {typeof sp.translated === 'string' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تمّت ترجمة {sp.translated} سلعة تلقائياً.</p>}
      {sp.removed === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حذف المنتج من التخزين الوسيط.</p>}

      {!importedList.length ? <p className={`${card} text-sm text-muted-foreground`}>لم تستورد أي منتج بعد. استورد من صفحة «تصفّح واستيراد».</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {importedList.map((r) => {
            const finalMinor = r.sale_price_override_minor ?? r.sale_price_minor;
            const availability = parseCjAvailability(r);
            return (
              <div key={r.id} className={`rounded-xl border p-3 space-y-2 ${r.hidden ? 'border-slate-300 bg-slate-50 opacity-80' : 'border-primary/20'}`}>
                <div className="flex gap-3">
                  <CjProductImage src={cjImg(cjProductImages(r)[0])} alt={r.name_ar || r.name} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="truncate text-sm font-bold">{isArabicText(r.name_ar) ? r.name_ar : <CjText original={r.name} ar={nameOf(r)} />}</div>
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النص الأصلي من المصدر</summary><p dir="auto">{r.name}</p><p dir="auto">{r.trbhh_category}</p></details>
                    <div className="text-[11px] text-muted-foreground"><span dir="ltr">PID {r.cj_product_id}</span> · التكلفة {sar(r.supplier_cost_minor + r.shipping_cost_minor)}</div>
                    <div className="text-sm font-extrabold text-primary">السعر: {sar(finalMinor)}{r.sale_price_override_minor != null && <span className="ms-1 text-[10px] font-normal text-amber-700">(معدّل يدوياً)</span>}</div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {r.trbhh_category && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">{r.trbhh_category}</span>}
                      <span className={`rounded px-1.5 py-0.5 font-bold ${r.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status === 'ready' ? 'جاهزة' : 'مسودّة'}</span>
                      {r.hidden === 1 && <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">مخفية</span>}
                    </div>
                    {availability
                      ? <p className="text-xs font-bold text-emerald-800">مخزون متحقق: {availability.stockQuantity.toLocaleString('en')} · خيارات الشحن: {availability.shippingOptions.length}</p>
                      : <p className="text-xs font-bold text-amber-800">المخزون أو الشحن غير متحقق حديثًا؛ لن يظهر الإعلان للعامة.</p>}
                  </div>
                </div>
                <AccessBoundary module="products" action="edit"><form action={saveCjArabic} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={BACK} />
                  <input className={`${input} flex-1`} name="nameAr" defaultValue={r.name_ar} placeholder="العنوان بالعربية" />
                  <SubmitButton className={btn} pendingText="جارٍ الحفظ…">حفظ</SubmitButton>
                </form></AccessBoundary>
                <div className="flex flex-wrap items-center gap-1">
                  <Link href={`/admin/suppliers/cj/review/${r.id}`} className={btn}>مراجعة / تحرير</Link>
                  <AccessBoundary module="products" action="edit"><form action={refreshCjImportedAvailability}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={BACK} /><SubmitButton className={ghost} pendingText="جارٍ التحديث…">تحديث الصور والمخزون والشحن</SubmitButton></form></AccessBoundary>
                  <AccessBoundary module="products" action="edit"><form action={saveCjPrice} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={BACK} />
                    <input className={`${input} w-24`} name="priceSar" inputMode="decimal" defaultValue={r.sale_price_override_minor != null ? (r.sale_price_override_minor / 100).toString() : ''} placeholder={(r.sale_price_minor / 100).toString()} aria-label="سعر البيع بالريال" />
                    <SubmitButton className={ghost} pendingText="جارٍ…">سعر</SubmitButton>
                  </form></AccessBoundary>
                  <AccessBoundary module="products" action="edit"><form action={translateCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={BACK} /><SubmitButton className={ghost} pendingText="جارٍ الترجمة…">ترجمة</SubmitButton></form></AccessBoundary>
                  <AccessBoundary module="products" action="suspend"><form action={toggleCjHidden}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hidden" value={r.hidden ? '0' : '1'} /><input type="hidden" name="back" value={BACK} /><SubmitButton className={ghost} pendingText="جارٍ…">{r.hidden ? 'إظهار' : 'إخفاء'}</SubmitButton></form></AccessBoundary>
                  <AccessBoundary module="products" action="delete"><form action={removeCjProduct}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={BACK} /><SubmitButton className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700" pendingText="جارٍ الحذف…">حذف</SubmitButton></form></AccessBoundary>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
