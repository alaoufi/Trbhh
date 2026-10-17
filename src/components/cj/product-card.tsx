import Link from 'next/link';
import { ShareButtons } from '@/components/share-buttons';
import { primaryOrigin } from '@/lib/public-origin';
import { BadgeCheck, ChevronDown } from 'lucide-react';
import type { CjProductRow } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { compactAdTitle } from '@/lib/ad-presentation';
import { CjProductImage } from './product-image';
import {CjLiveNumbers} from './cj-live-numbers';
import { parseHighlightValue } from '@/lib/cj/highlight';

/**
 * بطاقة سلعة CJ بنفس تصميم بطاقة إعلانات السوق (AdCardMarketplace) في الرئيسية —
 * نفس الإطار والنسب والشارات. على البطاقة يُعرض السعر والعنوان فقط لتوفير المساحة؛ وتفاصيل
 * إضافية (القسم) داخل سهم قابل للطيّ يتمدّد/ينكمش. البائع «تربح» موثّق. بقية الأرقام الحيّة
 * في صفحة التفاصيل.
 */
export function CjProductCard({ product }: { product: CjProductRow }) {
  const title = product.name_ar || 'منتج بانتظار ترجمة الاسم';
  const source = cjProductImages(product)[0];
  const highlight = parseHighlightValue(product.highlight_label);
  return <div className="marketplace-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <Link href={`/cj/${product.id}`} className="flex min-w-0 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <CjProductImage src={source ? cjImg(source) : null} alt={compactAdTitle(title)} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        {/* وسم تمييز تسويقي (مثل «متميز») بلونه المحدَّد — يظهر فقط إذا حدّده الأدمن (بلا شارة ثابتة). */}
        {highlight && <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm" style={{ backgroundColor: highlight.color }}>{highlight.label}</span>
        </div>}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-2.5 pb-1.5 sm:p-3 sm:pb-1.5">
        <p className="text-xs font-bold text-primary">رقم المنتج: <b dir="ltr">{String(product.id)}</b></p>
        <h3 className="line-clamp-2 min-h-9 break-words text-[13px] font-bold leading-[1.35] text-slate-800">{compactAdTitle(title)}</h3>
      </div>
    </Link>
    <div className="px-2.5 pb-2"><CjLiveNumbers pid={product.cj_product_id} productId={Number(product.id)}/></div>
    {/* التفاصيل (القسم) مطويّة افتراضياً لتوفير المساحة — سهم يتمدّد/ينكمش. */}
    {product.trbhh_category && <details className="cj-card-details group/d border-t border-slate-100 px-2.5 sm:px-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-1 py-1.5 text-[11px] font-bold text-slate-500 [&::-webkit-details-marker]:hidden">
        التفاصيل
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/d:rotate-180" />
      </summary>
      <p className="pb-1.5 text-[11px] leading-5 text-slate-500" dir="auto">{product.trbhh_category}</p>
    </details>}
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-500 sm:px-3">
      <span className="inline-flex min-w-0 items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="بائع موثق" />تربح</span>
      <ShareButtons compact url={`${primaryOrigin}/cj/${product.id}`} title={product.name_ar || product.name} />
    </div>
  </div>;
}
