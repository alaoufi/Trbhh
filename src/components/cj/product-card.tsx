import Link from 'next/link';
import type { CjProductRow } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { cjPriceLabel } from '@/lib/cj/presentation';
import { CjProductImage } from './product-image';

export function CjProductCard({ product }: { product: CjProductRow }) {
  const title = product.name_ar || 'منتج بانتظار ترجمة الاسم';
  const source = cjProductImages(product)[0];
  return <Link href={`/cj/${product.id}`} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <CjProductImage src={source ? cjImg(source) : null} alt={title} className="aspect-square w-full object-contain p-3" />
    <div className="flex flex-1 flex-col gap-2 border-t border-slate-100 p-3 sm:p-4">
      <h2 className="line-clamp-2 text-sm font-bold leading-6 text-primary [overflow-wrap:anywhere]">{title}</h2>
      <p className="mt-auto text-base font-extrabold text-primary sm:text-lg">{cjPriceLabel(product.sale_price_override_minor ?? product.sale_price_minor, product.currency)}</p>
      <span className="text-xs text-slate-500">معاينة التفاصيل والخيارات</span>
    </div>
  </Link>;
}
