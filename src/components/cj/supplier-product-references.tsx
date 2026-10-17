import Link from 'next/link';
import type {SupplierProductReference} from '@/lib/cj/product-reference';
export function SupplierProductReferences({products}:{products?:SupplierProductReference[]}){
 if(!products?.length)return null;
 return <ul className="space-y-1 text-xs" aria-label="مراجع المنتجات">{products.map((p,index)=><li key={`${p.pid}:${p.vid}:${index}`} className="min-w-0 break-all rounded-lg bg-slate-50 p-2">
 {p.storefrontProductId?<Link href={`/cj/${p.storefrontProductId}`} className="font-bold text-primary underline">رقم المنتج: {p.storefrontProductId}</Link>:<span>رقم تربح غير محفوظ في هذا الطلب القديم</span>}
 <span className="ms-2">الكمية: {p.quantity}</span><details><summary className="cursor-pointer text-slate-500">تفاصيل المرجع</summary><span className="block">معرّف المصدر: <bdi>{p.pid}</bdi> · رقم الخيار: <bdi>{p.vid}</bdi></span></details>
 </li>)}</ul>;
}
