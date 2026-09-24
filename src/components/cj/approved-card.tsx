import Link from 'next/link';
import type { ApprovedPreview } from '@/lib/cj/approved-catalog';
import { cjPriceLabel } from '@/lib/cj/presentation';
import { PriceText } from '@/components/price-text';
import { CjProductImage } from './product-image';

export function CjApprovedCard({ product }: { product: ApprovedPreview }) {
  return <Link href={product.href} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:shadow-md">
    <CjProductImage src={product.images[0] ?? null} alt={product.title} className="aspect-square w-full object-contain p-3" />
    <div className="flex flex-1 flex-col gap-2 border-t border-slate-100 p-3 sm:p-4">
      <span className="text-xs font-semibold text-slate-500">سلعة معتمدة باسم تربح</span>
      <h2 className="line-clamp-2 text-sm font-bold leading-6 text-primary [overflow-wrap:anywhere]">{product.title}</h2>
      <p className="mt-auto"><PriceText>{cjPriceLabel(product.priceMinor)}</PriceText></p>
      <span className="text-xs text-slate-500">معاينة التفاصيل</span>
    </div>
  </Link>;
}
