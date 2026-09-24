'use client';
/* eslint-disable @next/next/no-img-element -- provider image URLs are validated server-side; use native lazy-loaded images without a configured remote loader. */
import Link from 'next/link';
import {useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Expand,X} from 'lucide-react';
import {AddCommerceCartItem,PurchaseCartLink} from './purchase-cart-client';
import type {PublicCommerceProduct} from '@/lib/commerce/public-product';
import {formatSar} from '@/lib/commerce/money';

export function CommerceProductDetail({product,shippingFeeMinor,priceBasis,purchasingEnabled,shippingTerms}:{product:PublicCommerceProduct;shippingFeeMinor:number|null;priceBasis:'inclusive'|'exclusive'|null;purchasingEnabled:boolean;shippingTerms:string}){
 const[selected,setSelected]=useState(0),dialog=useRef<HTMLDialogElement>(null),images=product.images;
 const[selectedVariant,setSelectedVariant]=useState(''),variant=product.variants.find(item=>item.key===selectedVariant);
 const visiblePrice=variant?.priceMinor??(product.variants.length?Math.min(...product.variants.map(item=>item.priceMinor)):product.priceMinor);
 const priceRange=new Set(product.variants.map(item=>item.priceMinor)).size>1&&!variant;
 const move=(step:number)=>setSelected(index=>(index+step+Math.max(images.length,1))%Math.max(images.length,1));
 return <div className="mx-auto max-w-6xl pb-28 lg:pb-8">
  <div className="mb-4 flex items-center justify-between gap-3"><nav aria-label="مسار التنقل" className="text-xs font-bold text-slate-500"><Link href="/shop" className="hover:text-[#16294a]">متجر تربح</Link><span className="mx-2">/</span><span className="text-[#16294a]">تفاصيل المنتج</span></nav><PurchaseCartLink/></div>
  <main className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)] lg:gap-8">
   <section aria-label="صور المنتج" className="min-w-0 space-y-3">
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="aspect-square max-h-[580px] bg-slate-50">{images.length?<img src={images[selected]} alt={product.title} fetchPriority="high" className="h-full w-full object-contain p-2 sm:p-5"/>:<div className="grid h-full place-items-center text-sm font-bold text-slate-400">صورة المنتج غير متوفرة</div>}</div>
     {images.length>1&&<><button type="button" onClick={()=>move(-1)} aria-label="الصورة السابقة" className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow"><ChevronRight/></button><button type="button" onClick={()=>move(1)} aria-label="الصورة التالية" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow"><ChevronLeft/></button></>}
     {images.length>0&&<button type="button" onClick={()=>dialog.current?.showModal()} aria-label="تكبير صورة المنتج" className="absolute bottom-3 left-3 grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow"><Expand className="h-5 w-5"/></button>}
    </div>
    {images.length>1&&<div className="flex max-w-full gap-2 overflow-x-auto pb-2">{images.map((image,index)=><button key={`${image}-${index}`} type="button" onClick={()=>setSelected(index)} aria-label={`عرض الصورة ${index+1}`} aria-pressed={selected===index} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white ${selected===index?'border-[#ff6a1a]':'border-slate-200'}`}><img src={image} alt="" loading="lazy" className="h-full w-full object-contain p-1"/></button>)}</div>}
    <dialog ref={dialog} className="m-auto w-[calc(100%_-_2rem)] max-w-4xl rounded-2xl bg-white p-3 backdrop:bg-slate-950/70" aria-label="صورة المنتج المكبرة"><form method="dialog" className="mb-2 flex justify-end"><button aria-label="إغلاق" className="grid h-11 w-11 place-items-center rounded-full border"><X/></button></form>{images[selected]&&<img src={images[selected]} alt={product.title} className="max-h-[75vh] w-full object-contain"/>}</dialog>
   </section>
   <section className="min-w-0 space-y-4">
    {product.featured&&<span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-800">منتج مميّز</span>}
    <h1 className="text-xl font-extrabold leading-8 text-[#16294a] sm:text-2xl">{product.title}</h1>
    <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4"><p className="text-xs font-bold text-orange-900">{priceRange?'يبدأ من ':''}السعر{priceBasis==='inclusive'?' · شامل الضريبة':priceBasis==='exclusive'?' · قبل الضريبة':''}</p><p className="mt-1 text-3xl font-black tracking-tight text-[#c4510b]">{formatSar(visiblePrice)} <span className="text-base">ر.س</span></p></div>
    {variant&&<p className="text-sm font-bold text-emerald-700">الخيار المحدد متوفر · الكمية {variant.stock}</p>}
    {!product.requiresVariantSelection&&product.stock>0&&<p className="text-sm font-bold text-emerald-700">متوفر · الكمية المتاحة {product.stock}</p>}
    {product.requiresVariantSelection&&!variant&&<p className="text-sm font-bold text-slate-600">تختلف الخيارات والكمية المتاحة حسب الخيار المحدد.</p>}
    {product.brand&&<p className="text-sm text-slate-600">العلامة التجارية: <b className="text-[#16294a]">{product.brand}</b></p>}
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><AddCommerceCartItem productId={product.id} variants={product.variants} requiresVariant={product.requiresVariantSelection} maximum={product.stock} selectedVariantKey={selectedVariant} onVariantChange={setSelectedVariant}/><button type="button" disabled className="mt-2 hidden min-h-12 w-full cursor-not-allowed rounded-xl border border-[#16294a]/20 bg-slate-100 px-4 text-sm font-extrabold text-slate-400 sm:block">شراء الآن · غير متاح حاليًا</button></div>
    {purchasingEnabled?<p className="text-xs font-semibold text-slate-500">سيُعاد التحقق من السعر والتوفر والشحن قبل إنشاء الطلب.</p>:<p className="rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">أضف المنتج إلى سلتك للمراجعة. الشراء والدفع غير متاحين حاليًا.</p>}
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-extrabold text-[#16294a]">معلومات الشحن</h2>{shippingFeeMinor!==null?<p className="mt-2 text-sm leading-6 text-slate-600">رسوم التوصيل الحالية: <b className="text-[#16294a]">{formatSar(shippingFeeMinor)} ر.س</b> للطلب.</p>:<p className="mt-2 text-sm leading-6 text-slate-600">رسوم التوصيل ومدة الوصول غير متاحة حاليًا.</p>}{shippingTerms&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{shippingTerms}</p>}</div>
   </section>
  </main>
  {product.description&&<section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">وصف المنتج</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{product.description}</p></section>}
  {product.brand&&<section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">المواصفات</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><dt className="text-slate-500">العلامة التجارية</dt><dd className="font-bold text-[#16294a]">{product.brand}</dd></div>{product.options.map(option=><div key={option} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><dt className="text-slate-500">خيارات المنتج</dt><dd className="font-bold text-[#16294a]">{option}</dd></div>)}</dl></section>}
  <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">سياسة الإرجاع والاسترداد</h2><p className="mt-2 text-sm leading-6 text-slate-600">تخضع الطلبات المباشرة لسياسة تربح المنشورة. راجع <Link href="/pages/terms" className="font-bold text-[#16294a] underline">الشروط والأحكام</Link> قبل إتمام أي شراء.</p></section>
  <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,.08)] backdrop-blur lg:hidden"><div className="mx-auto flex max-w-xl items-center gap-2"><button type="button" onClick={()=>document.querySelector<HTMLButtonElement>('[data-add-commerce-cart]')?.click()} className="min-h-12 flex-1 rounded-xl bg-[#ff6a1a] px-3 text-sm font-extrabold text-white">أضف إلى السلة</button><button type="button" disabled className="min-h-12 flex-1 rounded-xl bg-slate-200 px-3 text-sm font-extrabold text-slate-500">شراء الآن</button></div></div>
 </div>;
}
