import Link from 'next/link';
import type { CjProductRow } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { CjProductImage } from './product-image';
import { CjLiveNumbers } from './cj-live-numbers';

export function CjProductCard({ product }: { product: CjProductRow }) {
  const title = product.name_ar || 'منتج بانتظار ترجمة الاسم';
  const source = cjProductImages(product)[0];
  const finalMinor = product.sale_price_override_minor ?? product.sale_price_minor;
  return <div className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
    <Link href={`/cj/${product.id}`} className="flex min-w-0 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <CjProductImage src={source ? cjImg(source) : null} alt={title} className="aspect-square w-full object-contain p-3" />
      <div className="flex min-w-0 flex-col gap-1 border-t border-slate-100 p-3 pb-2 sm:p-4 sm:pb-2">
        <h2 className="line-clamp-2 min-h-[3rem] text-sm font-bold leading-6 text-primary [overflow-wrap:anywhere]">{title}</h2>
      </div>
    </Link>
    {/* الأرقام الحيّة الحقيقية (السعر/المخزون/الشحن/المدة) تُجلب لحظياً عند ظهور البطاقة. */}
    <div className="px-3 pb-3 sm:px-4"><CjLiveNumbers pid={product.cj_product_id} priceMinor={finalMinor} /></div>
  </div>;
}
