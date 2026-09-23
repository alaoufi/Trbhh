import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { cjStorefrontView, importedToAdCard } from '@/lib/cj/storefront';
import { getStorefrontCjProduct, listStorefrontCjProducts } from '@/lib/cj/mapping';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة', robots: { index: false, follow: false } };

const sar = (m: number) => `${new Intl.NumberFormat('en-US').format(Math.round(m / 100))} ر.س`;

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
  const readyOnly = !view.isStaff;
  const p = await getStorefrontCjProduct(id, readyOnly);
  if (!p) notFound();

  const price = p.sale_price_override_minor ?? p.sale_price_minor;
  const title = p.name_ar || p.name || 'سلعة';
  const others = (await listStorefrontCjProducts(readyOnly, 24)).filter((r) => r.image && Number(r.id) !== id).slice(0, 12).map(importedToAdCard);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><b>معاينة إدارية</b> — مخفية عن الأعضاء والزوار.</p>
      )}
      <nav className="text-sm"><Link href="/cj" className="text-primary hover:underline">‹ رجوع للسلع والإعلانات</Link></nav>

      <div className="grid gap-5 md:grid-cols-2">
        {/* الصورة */}
        <div className="card-3d overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image
            ? <img src={p.image} alt={title} className="aspect-square w-full object-cover" />
            : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-muted-foreground">لا صورة</div>}
        </div>

        {/* المعلومات (بلا بيانات تواصل أو موقع أو بائع) */}
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold leading-7">{title}</h1>
          {p.trbhh_category && <div className="text-sm text-muted-foreground">{p.trbhh_category}</div>}
          <div className="text-3xl font-extrabold text-primary">{sar(price)}</div>
          <div className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" /> متوفّر — يُشحن داخل السعودية</div>

          <button disabled className="w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-500" aria-disabled>الشراء قريباً</button>
          <p className="rounded-lg bg-secondary/40 p-2 text-xs text-muted-foreground">الأسعار بالريال السعودي شاملة تقدير الشحن والهامش. الشراء والدفع سيُفعّلان لاحقاً.</p>
        </div>
      </div>

      {/* الوصف */}
      {p.display_description_ar && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-primary">التفاصيل</h2>
          <div className="card-3d whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7">{p.display_description_ar}</div>
        </section>
      )}

      {/* سلع أخرى (نفس تصميم بطاقات الإعلانات) */}
      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-primary">سلع أخرى قد تعجبك</h2>
          <AdGrid ads={others} />
        </section>
      )}
    </div>
  );
}
