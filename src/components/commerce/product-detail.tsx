'use client';
import {ProductSectionNav} from '@/components/product-section-nav';
import {SizeReferenceGuide} from '@/components/size-reference-guide';
/* eslint-disable @next/next/no-img-element -- provider image URLs are validated server-side; use native lazy-loaded images without a configured remote loader. */
import Link from 'next/link';
import {useState} from 'react';
import {ProductImageZoom} from '@/components/product-image-zoom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {AddCommerceCartItem} from './purchase-cart-client';
import type {PublicCommerceProduct} from '@/lib/commerce/public-product';
import {formatSar} from '@/lib/commerce/money';
import {remindRestockAction} from '@/app/shop/actions';

export function CommerceProductDetail({product,similar,shippingFeeMinor,priceBasis,purchasingEnabled,shippingTerms,reminded}:{product:PublicCommerceProduct;similar:PublicCommerceProduct[];shippingFeeMinor:number|null;priceBasis:'inclusive'|'exclusive'|null;purchasingEnabled:boolean;shippingTerms:string;reminded?:boolean}){
 const[selected,setSelected]=useState(0);
 const[selectedVariant,setSelectedVariant]=useState(''),variant=product.variants.find(item=>item.key===selectedVariant);
 const images=variant?.image?[variant.image,...product.images.filter(image=>image!==variant.image)]:product.images;
 const visiblePrice=variant?.priceMinor??(product.variants.length?Math.min(...product.variants.map(item=>item.priceMinor)):product.priceMinor);
 const priceRange=new Set(product.variants.map(item=>item.priceMinor)).size>1&&!variant;
 const sectionItems=[...(product.description?[{id:'product-description',label:'وصف المنتج'}]:[]),...((product.brand||product.options.length>0||product.weightLabel)?[{id:'product-specifications',label:'المواصفات'}]:[]),{id:'product-shipping',label:'الشحن والتسليم'},{id:'product-returns',label:'الإرجاع والاسترداد'},...(similar.length?[{id:'product-related',label:'منتجات مشابهة'}]:[])];
 const move=(step:number)=>setSelected(index=>(index+step+Math.max(images.length,1))%Math.max(images.length,1));
 return <div className="mx-auto max-w-6xl pb-28 lg:pb-8">
  <div className="mb-4"><nav aria-label="مسار التنقل" className="text-xs font-bold text-slate-500"><Link href="/shop" className="hover:text-[#16294a]">متجر تربح</Link><span className="mx-2">/</span><span className="text-[#16294a]">تفاصيل المنتج</span></nav></div>
  <main className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,.85fr)_minmax(340px,1.15fr)] lg:gap-5">
   <section aria-label="صور المنتج" className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_64px]">
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="h-[280px] bg-white sm:h-[320px] lg:h-[360px]">{images.length?<ProductImageZoom src={images[selected]} onPrevious={images.length>1?()=>move(-1):undefined} onNext={images.length>1?()=>move(1):undefined} positionLabel={`${selected+1} / ${images.length}`} alt={product.title} className="h-full w-full"><img src={images[selected]} alt={product.title} fetchPriority="high" className="h-full w-full object-contain"/></ProductImageZoom>:<div className="grid h-full place-items-center text-sm font-bold text-slate-400">صورة المنتج غير متوفرة</div>}</div>
     {images.length>1&&<><button type="button" onClick={()=>move(-1)} aria-label="الصورة السابقة" className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow"><ChevronRight/></button><button type="button" onClick={()=>move(1)} aria-label="الصورة التالية" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow"><ChevronLeft/></button></>}
    </div>
    {images.length>1&&<div className="flex max-w-full gap-2 overflow-x-auto pb-2 lg:max-h-[362px] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">{images.map((image,index)=><button key={`${image}-${index}`} type="button" onClick={()=>setSelected(index)} onMouseEnter={()=>setSelected(index)} onFocus={()=>setSelected(index)} aria-label={`عرض الصورة ${index+1}`} aria-pressed={selected===index} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white ${selected===index?'border-[#ff6a1a]':'border-slate-200'}`}><img src={image} alt="" loading="lazy" className="h-full w-full object-contain p-1"/></button>)}</div>}
   </section>
   <section aria-label="معلومات المنتج وخيارات الشراء" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    {product.featured&&<span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-800">منتج مميّز</span>}
    <h1 className="text-xl font-extrabold leading-8 text-[#16294a] sm:text-2xl">{product.title}</h1>
    <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4"><p className="text-xs font-bold text-orange-900">{priceRange?'يبدأ من ':''}السعر{priceBasis==='inclusive'?' · شامل الضريبة':priceBasis==='exclusive'?' · قبل الضريبة':''}</p><p className="mt-1 text-3xl font-black tracking-tight text-[#c4510b]">{formatSar(visiblePrice)} <span className="text-base">ر.س</span></p></div>
    {variant&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><p className="font-bold text-emerald-800">المتغير المحدد متوفر · الكمية {variant.stock}</p>{(variant.vid||variant.sku)&&<p className="mt-1 text-xs text-slate-600">{variant.vid?`VID ${variant.vid}`:''}{variant.vid&&variant.sku?' · ':''}{variant.sku?`SKU ${variant.sku}`:''}</p>}<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">{Object.entries(variant.attributes).map(([key,value])=><div key={`${key}-${value}`} className="flex min-w-0 gap-1"><dt className="shrink-0 font-bold text-slate-500">{key}:</dt><dd className="break-words font-semibold">{value}</dd></div>)}</dl>{variant.originalPriceMinor&&<p className="mt-2 text-xs text-slate-500">السعر السابق {formatSar(variant.originalPriceMinor)} ر.س</p>}</div>}
    {!product.requiresVariantSelection&&product.stock>0&&<p className="text-sm font-bold text-emerald-700">متوفر · الكمية المتاحة {product.stock}</p>}
    {product.requiresVariantSelection&&!variant&&<p className="text-sm font-bold text-slate-600">تختلف الخيارات والكمية المتاحة حسب الخيار المحدد.</p>}
    {product.brand&&<p className="text-sm text-slate-600">العلامة التجارية: <b className="text-[#16294a]">{product.brand}</b></p>}
    {product.stock<=0?(
     <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4">
      <p className="text-sm font-extrabold text-amber-800">نفد المخزون حالياً</p>
      {reminded?<p className="mt-1 text-sm font-bold text-emerald-700">✅ سنذكّرك عند توفّر السلعة.</p>:(
       <form action={remindRestockAction} className="mt-2">
        <input type="hidden" name="productId" value={product.id}/>
        <input type="hidden" name="back" value={`/shop/${product.id}`}/>
        <button className="min-h-12 w-full rounded-xl border-2 border-[#16294a] bg-white px-4 text-sm font-extrabold text-[#16294a] hover:bg-slate-50">🔔 احجز / ذكّرني عند التوفر</button>
       </form>
      )}
      <SizeReferenceGuide/>
     </div>
    ):(
     <div className="rounded-2xl border border-slate-200 bg-white p-4"><AddCommerceCartItem productId={product.id} variants={product.variants} requiresVariant={product.requiresVariantSelection} maximum={product.stock} selectedVariantKey={selectedVariant} onVariantChange={setSelectedVariant}/><SizeReferenceGuide/><button type="button" disabled className="mt-2 hidden min-h-12 w-full cursor-not-allowed rounded-xl border border-[#16294a]/20 bg-slate-100 px-4 text-sm font-extrabold text-slate-400 sm:block">شراء الآن · غير متاح حاليًا</button></div>
    )}
    {purchasingEnabled?<p className="text-xs font-semibold text-slate-500">سيُعاد التحقق من السعر والتوفر والشحن قبل إنشاء الطلب.</p>:<p className="rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">أضف المنتج إلى سلتك للمراجعة. الشراء والدفع غير متاحين حاليًا.</p>}
    <div id="product-shipping" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-extrabold text-[#16294a]">الشحن والتسليم إلى السعودية</h2>{product.bundledShipping?<p className="mt-2 text-sm leading-6 text-slate-600">الشحن <b className="text-[#16294a]">مشمول في السعر الإجمالي المعروض</b> — لا رسوم إضافية عند الطلب.</p>:variant?.shippingMinor!==null&&variant?.shippingMinor!==undefined?<p className="mt-2 text-sm leading-6 text-slate-600">رسوم الشحن لهذا الخيار: <b className="text-[#16294a]">{formatSar(variant.shippingMinor)} ر.س</b></p>:shippingFeeMinor!==null?<p className="mt-2 text-sm leading-6 text-slate-600">رسوم التوصيل المعروضة حاليًا: <b className="text-[#16294a]">{formatSar(shippingFeeMinor)} ر.س</b> للطلب.</p>:<p className="mt-2 text-sm leading-6 text-amber-900">رسوم التوصيل غير متاحة؛ لا يمكن متابعة الدفع حتى يظهر السعر بوضوح.</p>}{product.saudiShippingAvailable&&<p className="mt-2 text-sm leading-6 text-slate-600">تم التحقق من توفر الشحن إلى السعودية.</p>}{(variant?.deliveryEstimate||product.deliveryEstimate)&&<p className="mt-1 text-sm leading-6 text-slate-600">مدة الوصول المسجلة لدى الشحن: <b className="text-[#16294a]">{variant?.deliveryEstimate||product.deliveryEstimate}</b></p>}{shippingTerms&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{shippingTerms}</p>}</div>
   </section>
  </main>
  <ProductSectionNav items={sectionItems}/>
  {product.description&&<section id="product-description" className="scroll-mt-24 mt-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">وصف المنتج</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{product.description}</p></section>}
  {(product.brand||product.options.length>0||product.weightLabel)&&<section id="product-specifications" className="scroll-mt-24 mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">المواصفات والخصائص</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{product.brand&&<div className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><dt className="text-slate-500">العلامة التجارية</dt><dd className="font-bold text-[#16294a]">{product.brand}</dd></div>}{product.options.map(option=><div key={option} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><dt className="text-slate-500">خيارات المنتج</dt><dd className="font-bold text-[#16294a]">{option}</dd></div>)}{product.weightLabel&&<div className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><dt className="text-slate-500">الوزن</dt><dd className="font-bold text-[#16294a]">{product.weightLabel}</dd></div>}</dl></section>}
  {similar.length>0&&<section id="product-related" className="scroll-mt-24 mt-8 space-y-3"><h2 className="text-lg font-extrabold text-[#16294a]">منتجات مشابهة قد تعجبك</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{similar.map(item=><Link key={item.id} href={`/shop/${item.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 transition hover:shadow-md">{item.images[0]?<img src={item.images[0]} alt="" loading="lazy" className="aspect-square w-full rounded-xl bg-slate-50 object-contain"/>:<div className="aspect-square rounded-xl bg-slate-50"/>}<p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[#16294a]">{item.title}</p><p className="mt-2 text-lg font-black text-[#c4510b]">{formatSar(item.priceMinor)} ر.س</p></Link>)}</div></section>}
  <section id="product-returns" className="scroll-mt-24 mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-extrabold text-[#16294a]">سياسة الإرجاع والاسترداد</h2><p className="mt-2 text-sm leading-6 text-slate-600">تخضع الطلبات المباشرة لسياسة تربح المنشورة. راجع <Link href="/pages/terms" className="font-bold text-[#16294a] underline">الشروط والأحكام</Link> قبل إتمام أي شراء.</p></section>
  {product.stock>0&&<div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,.08)] backdrop-blur lg:hidden"><div className="mx-auto flex max-w-xl items-center gap-2"><button type="button" onClick={()=>document.querySelector<HTMLButtonElement>('[data-add-commerce-cart]')?.click()} className="min-h-12 flex-1 rounded-xl bg-[#ff6a1a] px-3 text-sm font-extrabold text-white">أضف إلى السلة</button><button type="button" disabled className="min-h-12 flex-1 rounded-xl bg-slate-200 px-3 text-sm font-extrabold text-slate-500">شراء الآن</button></div></div>}
 </div>;
}
