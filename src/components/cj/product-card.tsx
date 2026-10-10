import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import type { CjProductRow } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { cjPriceLabel } from '@/lib/cj/presentation';
import { compactAdTitle } from '@/lib/ad-presentation';
import { CjProductImage } from './product-image';
import { PriceText } from '@/components/price-text';

/**
 * بطاقة سلعة CJ بنفس تصميم بطاقة إعلانات السوق (AdCardMarketplace) في الرئيسية —
 * نفس الإطار والنسب والشارات والتذييل — مع استخدام CjProductImage لصور CJ (وكيل الصور +
 * إعادة التحميل عند الفشل). البائع «تربح» موثّق. على البطاقة يُعرض السعر فقط؛ وبقية الأرقام
 * الحيّة (المخزون/الشحن/المدة/الإجمالي) في صفحة التفاصيل كي لا يزدحم مظهر الشبكة.
 */
export function CjProductCard({ product }: { product: CjProductRow }) {
  const title = product.name_ar || 'منتج بانتظار ترجمة الاسم';
  const source = cjProductImages(product)[0];
  const finalMinor = product.sale_price_override_minor ?? product.sale_price_minor;
  return <Link href={`/cj/${product.id}`} className="marketplace-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
      <CjProductImage src={source ? cjImg(source) : null} alt={compactAdTitle(title)} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
      <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-[#16294a]/95 px-2.5 py-1 text-[10px] font-bold text-white">معروض</span>
      </div>
    </div>
    <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-1.5"><PriceText muted={finalMinor <= 0}>{cjPriceLabel(finalMinor, product.currency)}</PriceText></div>
      <h3 className="line-clamp-2 min-h-10 break-words text-sm font-bold leading-5 text-slate-800">{compactAdTitle(title)}</h3>
      {product.trbhh_category && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500"><span className="inline-flex min-w-0 items-center gap-1">{product.trbhh_category}</span></div>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="بائع موثق" />تربح</span>
      </div>
    </div>
  </Link>;
}
