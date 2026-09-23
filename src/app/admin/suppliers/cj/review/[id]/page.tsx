import { AccessBoundary } from '@/components/access-boundary';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAccess } from '@/lib/access-control/guards';
import { getCjProductById } from '@/lib/cj/mapping';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { approveCjProduct, saveCjReview } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراجعة سلعة CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const ghost = 'rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';
const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const usd = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);

export default async function CjReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const row = await getCjProductById(id);
  if (!row) notFound();

  // بيانات المصدر الحيّة من CJ (صور/متغيّرات/مخزون/وزن/سعر) — للعرض في المراجعة.
  const detail = await sampleOneCjProduct(row.cj_product_id).catch(() => null);
  const finalMinor = row.sale_price_override_minor ?? row.sale_price_minor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">مراجعة وتحرير السلعة</h1>
        <Link href="/admin/suppliers/cj/browse" className={ghost}>عودة للبضائع المستوردة ←</Link>
      </div>
      {sp.saved === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حفظ المراجعة.</p>}
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">تحرير بيانات العرض (عربية) دون المساس ببيانات المصدر من CJ. لا شراء ولا نشر تلقائي؛ السلعة تبقى في التخزين الوسيط.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* بيانات المصدر (CJ) — للقراءة */}
        <div className={card}>
          <h2 className="font-bold">بيانات المصدر (CJ) — للقراءة فقط</h2>
          <div className="flex flex-wrap gap-1">
            {(detail && detail.ok ? detail.data.images : [row.image].filter(Boolean)).slice(0, 8).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="h-20 w-20 rounded object-cover" loading="lazy" />
            ))}
          </div>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            <li dir="ltr">PID: {row.cj_product_id}</li>
            <li dir="ltr">SKU: {row.cj_sku || '—'}</li>
            <li dir="ltr" className="font-bold text-foreground">{row.name}</li>
            <li>تصنيف CJ: {detail && detail.ok ? (detail.data.category || '—') : '—'}</li>
            <li>سعر CJ: {detail && detail.ok ? usd(detail.data.priceUsd) : '—'} · إجمالي المخزون (عيّنة): {detail && detail.ok ? detail.data.totalStock : '—'}</li>
          </ul>
          {row.source_description && <details className="text-xs"><summary className="cursor-pointer font-bold">الوصف الأصلي</summary><p className="mt-1 whitespace-pre-wrap" dir="ltr">{row.source_description.slice(0, 2000)}</p></details>}
          {detail && detail.ok && detail.data.variants.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-right text-xs"><thead className="bg-primary/5"><tr>{['المتغيّر', 'SKU', 'سعر $', 'وزن(غ)', 'مخزون'].map((h) => <th key={h} className="p-1.5">{h}</th>)}</tr></thead><tbody>
              {detail.data.variants.map((v) => <tr key={v.vid} className="border-t"><td className="p-1.5">{v.name || '—'}</td><td className="p-1.5" dir="ltr">{v.sku}</td><td className="p-1.5">{usd(v.priceUsd)}</td><td className="p-1.5">{v.weight ?? '—'}</td><td className="p-1.5">{v.stock ?? '—'}</td></tr>)}
            </tbody></table></div>
          )}
          <div className="text-xs text-muted-foreground">التكلفة (سلعة+شحن): {sar(row.supplier_cost_minor + row.shipping_cost_minor)} · السعر المحسوب: {sar(row.sale_price_minor)}</div>
        </div>

        {/* بيانات تربح (عربية) — قابلة للتحرير */}
        <AccessBoundary module="products" action="edit"><form action={saveCjReview} className={card}>
          <h2 className="font-bold">بيانات العرض في تربح (عربية)</h2>
          <input type="hidden" name="id" value={row.id} />
          <label className="block text-sm">العنوان العربي
            <input className={input} name="nameAr" defaultValue={row.name_ar} placeholder="عنوان السلعة بالعربية" />
          </label>
          <label className="block text-sm">الوصف العربي
            <textarea className={input} name="descriptionAr" rows={5} defaultValue={row.display_description_ar ?? ''} placeholder="وصف السلعة بالعربية" />
          </label>
          <label className="block text-sm">تصنيف تربح (وسم)
            <input className={input} name="trbhhCategory" defaultValue={row.trbhh_category} placeholder="مثال: ملابس رجالية" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">سعر البيع (ر.س) — فارغ = المحسوب
              <input className={input} name="priceSar" inputMode="decimal" defaultValue={row.sale_price_override_minor != null ? (row.sale_price_override_minor / 100).toString() : ''} placeholder={(row.sale_price_minor / 100).toString()} />
            </label>
          </div>
          <AccessBoundary module="products" action="suspend"><input type="hidden" name="manageVisibility" value="1" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hidden" value="1" defaultChecked={row.hidden === 1} /> مخفية من المعاينة</label></AccessBoundary>
          <div className="flex items-center gap-2 pt-1">
            <button className={btn}>حفظ المراجعة</button>
            <span className="text-sm text-muted-foreground">السعر النهائي الحالي: <b className="text-primary">{sar(finalMinor)}</b></span>
          </div>
        </form></AccessBoundary>
        <AccessBoundary module="products" action="approve"><form action={approveCjProduct} className={card}>
          <input type="hidden" name="id" value={row.id} />
          <label className="block text-sm">حالة العرض
            <select className={input} name="status" defaultValue={row.status}>
              <option value="draft">مسودّة</option><option value="ready">جاهزة للعرض</option>
            </select>
          </label>
          <button className={btn}>اعتماد حالة العرض</button>
        </form></AccessBoundary>
      </div>
    </div>
  );
}
