'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {formatSar} from '@/lib/commerce/money';
import {normalizeCart,removeCartLine,setCartQuantity,type CartLine} from '@/lib/commerce/cart';
import type {SaudiAddressSnapshot} from '@/lib/commerce/addresses';

type ResolvedLine=CartLine&{title:string;image:string|null;variantName:string|null;unitPriceMinor:number;totalMinor:number;stock:number;available:boolean};
type Quote={lines:ResolvedLine[];subtotalMinor:number;discountMinor:number;productVatMinor:number|null;shippingFeeMinor:number|null;shippingVatMinor:number|null;shippingTotalMinor:number|null;totalMinor:number|null;pricingVerified:boolean;purchasingEnabled:boolean;deliveryEstimate:null};
const STORAGE_KEY='trbhh-commerce-cart-v1';
function money(value:number){return `${formatSar(value)} ر.س`;}

export function PurchaseCartLink(){
 const[count,setCount]=useState(0);
 useEffect(()=>{try{const parsed=normalizeCart(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'[]'));setCount(parsed.reduce((sum,line)=>sum+line.quantity,0));}catch{setCount(0);}},[]);
 return <Link href="/shop/cart" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#16294a]/20 bg-white px-4 py-2 text-sm font-extrabold text-[#16294a]">السلة <span className="rounded-full bg-[#16294a] px-2 py-0.5 text-xs text-white">{count}</span></Link>;
}

export function AddCommerceCartItem({productId,variants,requiresVariant,maximum,selectedVariantKey,onVariantChange}:{productId:string;variants:{key:string;name:string;priceMinor:number;stock:number;options:string[]}[];requiresVariant:boolean;maximum:number;selectedVariantKey?:string;onVariantChange?:(key:string)=>void}){
 const[internalSelected,setInternalSelected]=useState(''),[quantity,setQuantity]=useState('1'),[status,setStatus]=useState('');
 const selected=selectedVariantKey??internalSelected,variant=variants.find(item=>item.key===selected),mustSelect=requiresVariant;
 function add(){
  try{
   const qty=Number(quantity);if(!Number.isSafeInteger(qty)||qty<1||qty>(variant?.stock??maximum))throw new Error('quantity');
   if(mustSelect&&!variant)throw new Error('variant');
   const current=normalizeCart(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'[]'));
   const next=normalizeCart([...current,{productId,quantity:qty,...(variant?{variantKey:variant.key}:{})}]);
   sessionStorage.setItem(STORAGE_KEY,JSON.stringify(next));setStatus('أُضيف المنتج إلى السلة.');
  }catch(error){setStatus(error instanceof Error&&error.message==='variant'?'اختر اللون أو المقاس قبل الإضافة.':'تعذر الإضافة؛ تحقق من الكمية أو حد السلة.');}
 }
 const cap=variant?.stock??maximum;
 return <div className="space-y-3">
  {mustSelect&&<label className="block text-sm font-bold text-[#16294a]">اختر اللون أو المقاس أو الخيار
   <select value={selected} onChange={event=>{setInternalSelected(event.target.value);onVariantChange?.(event.target.value);}} required className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
    <option value="">اختر الخيار</option>{variants.map(item=><option key={item.key} value={item.key}>{item.name}{item.options.length&&item.options.join(' / ')!==item.name?` — ${item.options.join(' / ')}`:''} — المتاح {item.stock}</option>)}
   </select>
  </label>}
  <div className="flex flex-wrap items-end gap-3">
   <label className="text-sm font-bold">الكمية<input type="number" min={1} max={cap} step={1} value={quantity} onChange={event=>setQuantity(event.target.value)} className="mt-1 block h-12 w-24 rounded-xl border border-slate-300 px-3"/></label>
   <button data-add-commerce-cart type="button" onClick={add} disabled={mustSelect&&!variant} className="min-h-12 flex-1 rounded-xl bg-[#ff6a1a] px-5 text-sm font-extrabold text-white shadow-sm hover:bg-[#ea5c10] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">أضف إلى السلة</button>
  </div>
  <p role="status" aria-live="polite" className="min-h-5 text-sm font-bold text-emerald-700">{status}</p>
 </div>;
}

type CartAddress={id:string;label:string;isDefault:boolean;snapshot:SaudiAddressSnapshot};
export function PurchaseCart({addresses,signedIn}:{addresses:CartAddress[];signedIn:boolean}){
 const[items,setItems]=useState<CartLine[]>([]),[quote,setQuote]=useState<Quote|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[selectedAddress,setSelectedAddress]=useState(addresses.find(address=>address.isDefault)?.id||addresses[0]?.id||'');
 async function refresh(lines:CartLine[]){
  if(!lines.length){setQuote(null);setLoading(false);return;}
  setLoading(true);setError('');
  try{const response=await fetch('/api/shop/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:lines}),cache:'no-store'});if(!response.ok)throw new Error('unavailable');const data=await response.json() as Quote;setQuote(data);}
  catch{setError('لم نتمكن من تحديث الأسعار والتوفر الآن. أعد المحاولة قبل متابعة الشراء.');setQuote(null);}
  finally{setLoading(false);}
 }
 function save(next:CartLine[]){setItems(next);sessionStorage.setItem(STORAGE_KEY,JSON.stringify(next));void refresh(next);}
 useEffect(()=>{let loaded:CartLine[]=[];try{loaded=normalizeCart(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'[]'));sessionStorage.setItem(STORAGE_KEY,JSON.stringify(loaded));}catch{sessionStorage.removeItem(STORAGE_KEY);}setItems(loaded);void refresh(loaded);},[]);
 const totalQuantity=items.reduce((sum,item)=>sum+item.quantity,0),invalid=!!quote?.lines.some(line=>!line.available);
 return <div className="mx-auto grid max-w-6xl gap-5 pb-28 lg:grid-cols-[1fr_340px] lg:pb-0">
  <section className="min-w-0 space-y-4"><header><p className="text-sm font-bold text-[#ff6a1a]">متجر تربح</p><h1 className="mt-1 text-2xl font-extrabold text-[#16294a] sm:text-3xl">سلة مشترياتك</h1><p className="mt-1 text-sm text-slate-500">نراجع السعر والتوفر من بيانات تربح الحالية في كل مرة تفتح فيها السلة.</p></header>
   <ol aria-label="خطوات مراجعة الشراء" className="grid grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-center text-[10px] font-bold text-slate-600 sm:gap-2 sm:p-3 sm:text-xs"><li className={selectedAddress?'text-emerald-700':'text-[#ff6a1a]'}>١ · العنوان</li><li>٢ · المنتجات</li><li>٣ · الشحن والسعر</li><li className="text-slate-400">٤ · الدفع</li><li className="text-slate-400">٥ · المراجعة</li></ol>
   <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-[#16294a]">عنوان الشحن</h2><p className="mt-1 text-xs text-slate-500">سنستخدم العنوان المحدد ونحفظ نسخة ثابتة منه داخل الطلب عند تفعيل الشراء.</p></div><Link href={signedIn?'/account/addresses':'/login'} className="shrink-0 text-xs font-bold text-[#16294a] underline">{addresses.length?'إدارة العناوين':'إضافة عنوان'}</Link></div>
    {!signedIn?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">سجّل الدخول واحفظ عنوان الشحن قبل متابعة المراجعة.</p>:addresses.length===0?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">أضف عنوانًا سعوديًا كاملًا إلى حسابك قبل الشراء.</p>:<><label className="sr-only" htmlFor="commerce-address">اختر عنوان الشحن</label><select id="commerce-address" value={selectedAddress} onChange={event=>setSelectedAddress(event.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">{addresses.map(address=><option key={address.id} value={address.id}>{address.label}{address.isDefault?' · افتراضي':''} — {address.snapshot.city}</option>)}</select>{(()=>{const address=addresses.find(item=>item.id===selectedAddress);return address?<p className="mt-2 text-xs leading-5 text-slate-600">{address.snapshot.fullName} · {address.snapshot.phone}<br/>{[address.snapshot.region,address.snapshot.city,address.snapshot.district,address.snapshot.street,address.snapshot.buildingNumber,address.snapshot.postalCode].filter(Boolean).join('، ')}</p>:null;})()}</>}
   </section>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
   {loading&&<p className="rounded-xl bg-slate-100 p-4 text-sm font-bold text-slate-600">جارٍ تحديث المنتجات والأسعار…</p>}
   {!loading&&items.length===0&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-bold text-slate-700">سلتك فارغة الآن.</p><Link href="/shop" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#16294a] px-5 font-bold text-white">تصفّح المنتجات</Link></div>}
   <div className="space-y-3">{quote?.lines.map((line,index)=><article key={`${line.productId}-${line.variantKey||''}-${index}`} className="grid min-w-0 grid-cols-[88px_1fr] gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[112px_1fr] sm:gap-4 sm:p-4">
    <div className="aspect-square overflow-hidden rounded-xl bg-slate-100">{line.image?<img src={line.image} alt="" loading="lazy" className="h-full w-full object-contain"/>:<div className="grid h-full place-items-center text-xs text-slate-400">لا توجد صورة</div>}</div>
    <div className="min-w-0"><Link href={`/shop/${line.productId}`} className="line-clamp-2 text-sm font-extrabold leading-6 text-[#16294a] sm:text-base">{line.title}</Link>
     {line.variantName&&<p className="mt-1 truncate text-xs text-slate-600">الخيار: {line.variantName}</p>}
     <p className="mt-2 text-sm font-bold text-[#c4510b]">{money(line.unitPriceMinor)} <span className="text-xs font-medium text-slate-500">للوحدة</span></p>
     <p className={`mt-1 text-xs font-bold ${line.available?'text-emerald-700':'text-red-700'}`}>{line.available?`متوفر · الكمية المتاحة ${line.stock}`:'الكمية أو الخيار غير متوفر حاليًا'}</p>
     <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs font-bold text-slate-600">الكمية<input aria-label={`كمية ${line.title}`} type="number" min={1} max={Math.max(1,line.stock)} value={line.quantity} onChange={event=>{const qty=Number(event.target.value);if(Number.isSafeInteger(qty)&&qty>0)save(setCartQuantity(items,line.productId,qty,line.variantKey));}} className="ms-2 h-10 w-16 rounded-lg border border-slate-300 px-2 text-sm"/></label>
      <button type="button" onClick={()=>save(removeCartLine(items,line.productId,line.variantKey))} className="min-h-10 rounded-lg px-3 text-xs font-bold text-red-700 hover:bg-red-50">حذف</button><span className="ms-auto text-sm font-extrabold text-[#16294a]">{money(line.totalMinor)}</span></div>
    </div>
   </article>)}</div>
  </section>
  <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 sm:p-5"><h2 className="text-lg font-extrabold text-[#16294a]">ملخص الطلب</h2>
   <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-2"><span>السلع ({totalQuantity})</span><b>{quote?money(quote.subtotalMinor):'—'}</b></div><div className="flex justify-between gap-2 text-slate-600"><span>الخصومات</span><b>{quote?money(quote.discountMinor):'—'}</b></div><div className="flex justify-between gap-2 text-slate-600"><span>الشحن</span><b>{quote?.shippingFeeMinor===null||quote?.shippingFeeMinor===undefined?'غير متاح بعد':money(quote.shippingFeeMinor)}</b></div><div className="flex justify-between gap-2 text-slate-600"><span>ضريبة السلع والشحن</span><b>{quote?.productVatMinor===null||quote?.productVatMinor===undefined?'بانتظار سياسة معتمدة':money(quote.productVatMinor+(quote.shippingVatMinor||0))}</b></div>
    <div className="flex items-baseline justify-between gap-2 border-t border-slate-200 pt-3 text-base font-extrabold text-[#c4510b]"><span>الإجمالي</span><b className="text-xl">{quote?.totalMinor===null||quote?.totalMinor===undefined?'غير محسوب':money(quote.totalMinor)}</b></div></div>
   {quote?.deliveryEstimate&&<p className="mt-3 text-xs text-slate-600">التوصيل المتوقع: {quote.deliveryEstimate}</p>}
   <button type="button" disabled className="mt-5 min-h-12 w-full cursor-not-allowed rounded-xl bg-slate-300 px-4 text-sm font-extrabold text-slate-600" aria-disabled="true">الدفع غير متاح حاليًا</button>
   <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">الشراء والدفع ما زالا معطّلين. لن يُنشأ طلب ولن يُخصم مبلغ. سنفعّل المتابعة بعد اجتياز اختبارات التوفر والشحن والدفع واعتمادها.</p>
   {invalid&&<p className="mt-2 text-xs font-bold text-red-700">عدّل الكميات أو احذف المنتجات غير المتاحة لمتابعة السلة.</p>}
   <div className="mt-4 flex flex-wrap gap-2 text-xs"><Link href="/shop" className="font-bold text-[#16294a] underline">متابعة التصفح</Link><Link href="/account/addresses" className="font-bold text-[#16294a] underline">إدارة عناوين الشحن</Link></div>
  </aside>
  {items.length>0&&<div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,.08)] backdrop-blur lg:hidden"><div className="mx-auto flex max-w-xl items-center gap-3"><div className="min-w-0"><p className="text-[10px] font-bold text-slate-500">الإجمالي قبل الدفع</p><p className="truncate text-base font-black text-[#c4510b]">{quote?.totalMinor===null||quote?.totalMinor===undefined?'غير محسوب':money(quote.totalMinor)}</p></div><button type="button" disabled className="min-h-12 flex-1 rounded-xl bg-slate-300 px-3 text-sm font-extrabold text-slate-600">الدفع غير متاح</button></div></div>}
 </div>;
}
