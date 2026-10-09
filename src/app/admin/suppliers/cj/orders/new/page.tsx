import Link from 'next/link';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { listStorefrontCjProducts, getStorefrontCjProduct, parseCjDetails } from '@/lib/cj/mapping';
import { createRealCjTestOrder } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تجربة شراء CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-3';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';

const ERR: Record<string, string> = {
  invalid: 'بيانات غير صحيحة.',
  product: 'المنتج غير متاح.',
  variant: 'الخيار غير موجود.',
  unavailable: 'تعذّر التحقق الحيّ: المنتج/الخيار غير متوفّر أو لا شحن للسعودية الآن.',
};

export default async function NewCjTestOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('orders', 'create');
  const sp = await searchParams;
  const productId = Number(String(sp.product || ''));
  const product = Number.isSafeInteger(productId) && productId > 0 ? await getStorefrontCjProduct(productId, false) : null;
  const details = product ? parseCjDetails(product) : null;
  const products = product ? [] : await listStorefrontCjProducts(false, 60);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">تجربة شراء حقيقية (الإدارة فقط)</h1>
        <Link href="/admin/suppliers/cj/orders" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">لوحة المراقبة ←</Link>
      </div>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        يُنشئ هذا طلباً حقيقياً من منتج معروض، بعد تحقّق حيّ من CJ (سعر/مخزون/شحن إلى العنوان).
        <b> لا خصم هنا</b> — الدفع من محفظة CJ يتمّ من صفحة الطلب بعد الاعتماد وضمن السقف، ومحجوب ما لم يُفعَّل الشراء الحيّ.
      </p>
      {typeof sp.err === 'string' && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{ERR[sp.err] || 'تعذّرت العملية.'}{typeof sp.reason === 'string' ? ` (${sp.reason})` : ''}</p>
      )}

      {!product ? (
        <div className={card}>
          <h2 className="font-bold">اختر منتجاً معروضاً</h2>
          {!products.length ? <p className="text-sm text-muted-foreground">لا منتجات معروضة بعد. استورد منتجاً أولاً.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <li key={String(p.id)}>
                  <Link href={`/admin/suppliers/cj/orders/new?product=${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 p-2 text-sm hover:bg-primary/5">
                    <span className="line-clamp-1">{p.name_ar || p.name}</span>
                    <span className="text-xs font-bold text-primary">اختيار ←</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : !details?.variants.length ? (
        <div className={card}><p className="text-sm text-red-700">لا توجد خيارات (variants) مخزَّنة لهذا المنتج — أعد مزامنته.</p></div>
      ) : (
        <div className={card}>
          <h2 className="font-bold">{product.name_ar || product.name}</h2>
          <p className="text-xs text-muted-foreground" dir="ltr">PID {product.cj_product_id} · {details.variants.length} خيار</p>
          <AccessBoundary module="orders" action="create">
            <form action={createRealCjTestOrder} className="space-y-3">
              <input type="hidden" name="productId" value={String(product.id)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">الخيار (variant)
                  <select name="variantId" className={input} required>
                    {details.variants.map((v) => (
                      <option key={v.vid} value={v.vid}>{v.name || v.optionKey || v.sku || v.vid}{v.priceUsd ? ` — $${v.priceUsd}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">الكمية<input name="quantity" type="number" min="1" max="99" defaultValue="1" className={input} dir="ltr" /></label>
              </div>
              <div className="border-t pt-2">
                <div className="text-sm font-bold">عنوان الشحن (السعودية)</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">الاسم<input name="shipName" className={input} required /></label>
                  <label className="block text-sm">الجوال<input name="shipPhone" className={input} dir="ltr" required /></label>
                  <label className="block text-sm">المنطقة<input name="shipRegion" className={input} required /></label>
                  <label className="block text-sm">المدينة<input name="shipCity" className={input} required /></label>
                  <label className="block text-sm sm:col-span-2">العنوان التفصيلي<input name="shipAddress" className={input} required /></label>
                  <label className="block text-sm">الرمز البريدي<input name="shipZip" className={input} dir="ltr" placeholder="11564" /></label>
                </div>
              </div>
              <button className={btn}>تحقّق حيّ وإنشاء الطلب</button>
            </form>
          </AccessBoundary>
        </div>
      )}
    </div>
  );
}
