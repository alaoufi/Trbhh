import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, ShoppingCart, CreditCard } from 'lucide-react';
import { cjStorefrontView, importedToAdCard } from '@/lib/cj/storefront';
import { getStorefrontCjProduct, listStorefrontCjProducts, parseCjImages, setCjProductGallery } from '@/lib/cj/mapping';
import { getProduct } from '@/lib/cj/client';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة', robots: { index: false, follow: false } };

const sar = (m: number) => `${new Intl.NumberFormat('en-US').format(Math.round(m / 100))} ر.س`;

/** ينظّف وصف CJ (قد يحوي HTML) إلى نص عربي مقروء بفقرات ونقاط. */
function cleanDescription(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
  let gallery = parseCjImages(p);
  // إصلاح ذاتي: لو لا صور مخزَّنة، اجلبها حيّاً من CJ واحفظ روابطها (لا تُخزَّن صور، روابط فقط).
  if (!gallery.length && p.cj_product_id) {
    const det = await getProduct(p.cj_product_id).catch(() => null);
    if (det && det.ok) {
      gallery = [...new Set([det.data.productImage, ...(det.data.variants ?? []).map((v) => v.variantImage)].filter((s): s is string => !!s))];
      if (gallery.length) await setCjProductGallery(id, gallery);
    }
  }
  const description = p.display_description_ar ? cleanDescription(p.display_description_ar) : '';
  const others = (await listStorefrontCjProducts(readyOnly, 24)).filter((r) => r.image && Number(r.id) !== id).slice(0, 12).map(importedToAdCard);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><b>معاينة إدارية</b> — مخفية عن الأعضاء والزوار.</p>
      )}
      <nav className="text-sm"><Link href="/cj" className="text-primary hover:underline">‹ رجوع للسلع والإعلانات</Link></nav>

      <div className="grid gap-5 md:grid-cols-2">
        {/* معرض الصور */}
        <div className="space-y-2">
          <div className="card-3d overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gallery[0]
              ? <img src={gallery[0]} alt={title} className="aspect-square w-full object-cover" />
              : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-muted-foreground">لا صورة</div>}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.slice(0, 8).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-primary/15 object-cover" loading="lazy" />
              ))}
            </div>
          )}
        </div>

        {/* المعلومات (بلا بيانات تواصل أو موقع أو بائع) — الفرق: أضف للسلة/شراء */}
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold leading-7">{title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {p.trbhh_category && <span className="rounded-full bg-primary/10 px-2 py-1 font-bold text-primary">{p.trbhh_category}</span>}
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700">متوفّر</span>
            <span className="rounded-full bg-secondary px-2 py-1 text-muted-foreground">شحن داخل السعودية</span>
          </div>
          <div className="text-3xl font-extrabold text-primary">{sar(price)}</div>

          {/* أزرار الشراء (معطّلة حتى تفعيل الشراء) */}
          <div className="grid grid-cols-2 gap-2">
            <button disabled aria-disabled className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border-2 border-primary/30 bg-white px-4 py-3 font-bold text-primary/60"><ShoppingCart className="h-4 w-4" /> أضف للسلة</button>
            <button disabled aria-disabled className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-primary/50 px-4 py-3 font-bold text-white"><CreditCard className="h-4 w-4" /> شراء الآن</button>
          </div>
          <p className="rounded-lg bg-amber-50 p-2 text-center text-xs font-bold text-amber-800">الشراء قريباً — قيد التجهيز</p>

          {/* مواصفات سريعة (بأسلوب صفحة الإعلان) */}
          <div className="card-3d rounded-2xl p-3 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <span className="text-muted-foreground">التصنيف</span><span className="font-bold">{p.trbhh_category || '—'}</span>
              <span className="text-muted-foreground">التوفّر</span><span className="flex items-center gap-1 font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" /> متوفّر</span>
              <span className="text-muted-foreground">الشحن</span><span className="font-bold">داخل السعودية (يُحتسب عند الطلب)</span>
              <span className="text-muted-foreground">السعر</span><span className="font-bold text-primary">{sar(price)} شامل تقدير الشحن</span>
            </div>
          </div>
        </div>
      </div>

      {/* الوصف — منسّق بفقرات ونقاط */}
      {description && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-primary">التفاصيل</h2>
          <div className="card-3d rounded-2xl p-4 text-sm leading-8">
            {description.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="mb-3 whitespace-pre-line last:mb-0">{para}</p>
            ))}
          </div>
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
