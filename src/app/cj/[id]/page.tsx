import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { getStorefrontCjProduct } from '@/lib/cj/mapping';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

export default async function CjStoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const view = await cjStorefrontView();
  if (!view.visible) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-primary">قريباً</h1>
        <p className="mt-3 text-muted-foreground">هذا القسم قيد التجهيز وسيُعلَن قريباً.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">العودة للرئيسية</Link>
      </div>
    );
  }
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const p = await getStorefrontCjProduct(id, !view.isStaff);
  if (!p) notFound();

  const price = p.sale_price_override_minor ?? p.sale_price_minor;
  const title = p.name_ar || p.name || '—';

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><b>معاينة إدارية</b> — غير معلنة للعامة بعد.</p>
      )}
      <nav className="text-sm"><Link href="/cj" className="text-primary underline">← كل السلع</Link></nav>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-3d overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image
            ? <img src={p.image} alt="" className="aspect-square w-full object-cover" />
            : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-muted-foreground">لا صورة</div>}
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold leading-7">{title}</h1>
          {p.trbhh_category && <div className="text-sm text-muted-foreground">التصنيف: {p.trbhh_category}</div>}
          <div className="text-2xl font-extrabold text-primary">{sar(price)}</div>
          <div className="text-sm text-emerald-700">متوفّر</div>
          {p.display_description_ar && <div className="whitespace-pre-wrap rounded-xl bg-secondary/40 p-3 text-sm leading-7">{p.display_description_ar}</div>}

          {/* الشراء معطّل حالياً */}
          <button disabled className="w-full cursor-not-allowed rounded-lg bg-slate-300 px-4 py-3 font-bold text-slate-600" aria-disabled>
            الشراء قريباً
          </button>
          <p className="text-xs text-muted-foreground">الشراء والدفع سيُفعّلان لاحقاً. الأسعار بالريال السعودي شاملة تقدير الشحن والهامش.</p>
        </div>
      </div>
    </div>
  );
}
