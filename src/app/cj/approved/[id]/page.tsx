import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApprovedPreview } from '@/lib/cj/approved-catalog';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { cjPriceLabel } from '@/lib/cj/presentation';
import { CjProductGallery } from '@/components/cj/product-gallery';
import { CjProductDescription } from '@/components/cj/product-description';
import { PriceText } from '@/components/price-text';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة سلعة معتمدة — تجربة خاصة', robots: { index: false, follow: false } };

export default async function ApprovedPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await cjStorefrontView()).isStaff) notFound();
  const product = await getApprovedPreview((await params).id);
  if (!product) notFound();
  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 py-5 sm:px-5 [overflow-wrap:anywhere]" data-cj-trial="approved-product">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950"><b>معاينة خاصة</b> — عرض معلومات السلعة فقط. لا شراء أو دفع أو حجز مخزون من هذه الصفحة.</p>
    <Link href="/cj?tab=trbhh" className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline">العودة إلى اعلانات تربح</Link>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 lg:gap-8">
      <CjProductGallery images={product.images} title={product.title} />
      <section className="min-w-0 space-y-4" aria-label="معلومات السلعة المعتمدة">
        <p className="text-xs font-semibold text-slate-500">سلعة معتمدة للبيع باسم تربح</p>
        <h1 className="text-xl font-extrabold leading-8 text-primary sm:text-2xl">{product.title}</h1>
        <p><PriceText size="detail">{cjPriceLabel(product.priceMinor)}</PriceText></p>
        <p className="text-sm leading-7 text-slate-600">السعر من الكتالوج المعتمد. تكلفة الشحن والضريبة وشروط الطلب النهائية لا تُحسَب في هذه المعاينة.</p>
        <p className="text-sm text-slate-600">{product.stock > 0 ? 'توجد كمية مسجلة في الكتالوج؛ لا يتم حجزها في المعاينة.' : 'لا توجد كمية متاحة مسجلة حاليًا.'}</p>
      </section>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-3 text-lg font-extrabold text-primary">تفاصيل السلعة</h2>{product.description ? <CjProductDescription text={product.description} /> : <p className="text-sm text-slate-500">لا يوجد وصف إضافي محفوظ لهذه السلعة.</p>}</section>
  </div>;
}
