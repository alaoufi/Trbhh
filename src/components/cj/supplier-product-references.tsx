import Link from 'next/link';
import type {SupplierProductReference} from '@/lib/cj/product-reference';
export function SupplierProductReferences({products}:{products?:SupplierProductReference[]}){
 if(!products?.length)return null;
 return <ul className="space-y-1 text-xs" aria-label="مراجع المنتجات">{products.map((p,index)=><li key={`${p.pid}:${p.vid}:${index}`} className="min-w-0 break-all rounded-lg bg-slate-50 p-2">
 {p.storefrontProductId?<Link href={`/cj/${p.storefrontProductId}`} className="font-bold text-primary underline">رقم المنتج في تربح: {p.storefrontProductId}</Link>:<span>رقم تربح غير محفوظ في هذا الطلب القديم</span>}
 <span className="block">رقم المنتج لدى المورد: <bdi>{p.pid}</bdi> · رقم الخيار: <bdi>{p.vid}</bdi> · الكمية: {p.quantity}</span>
 </li>)}</ul>;
}
