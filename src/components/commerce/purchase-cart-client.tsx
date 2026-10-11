'use client';
/* eslint-disable @next/next/no-img-element -- provider image URLs are validated server-side; cart images use native lazy loading. */
import Link from 'next/link';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ShoppingCart,MapPin} from 'lucide-react';
import {formatSar} from '@/lib/commerce/money';
import {COMMERCE_CART_EVENT,COMMERCE_CART_STORAGE_KEY,addCartLine,countCartUnits,mergeCartLines,normalizeCart,readStoredCart,removeCartLine,setCartQuantity,writeStoredCart,type CartLine} from '@/lib/commerce/cart';
import type {SaudiAddressSnapshot} from '@/lib/commerce/addresses';

type ResolvedLine=CartLine&{title:string;image:string|null;variantName:string|null;variantKey:string|null;variantSku:string|null;variantVid:string|null;variantAttributes:Record<string,string>;unitPriceMinor:number;originalPriceMinor:number;discountMinor:number;totalMinor:number;stock:number;available:boolean;saudiShippingAvailable:boolean;deliveryEstimate:string|null;shippingFeeMinor:number|null};
type Quote={lines:ResolvedLine[];subtotalMinor:number;discountMinor:number;vatEnabled:boolean;productVatMinor:number|null;shippingFeeMinor:number|null;shippingVatMinor:number|null;shippingTotalMinor:number|null;totalMinor:number|null;pricingVerified:boolean;purchasingEnabled:boolean;deliveryEstimate:null};
function money(value:number){return `${formatSar(value)} ر.س`;}
function readClientCart(){return readStoredCart(window.localStorage,window.sessionStorage);}
function cartCount(){try{return countCartUnits(readClientCart());}catch{return 0;}}
function subscribeCart(callback:()=>void){window.addEventListener(COMMERCE_CART_EVENT,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(COMMERCE_CART_EVENT,callback);window.removeEventListener('storage',callback);};}
function useCartCount(){return useSyncExternalStore(subscribeCart,cartCount,()=>0);}
function publishCart(items:CartLine[]){const clean=writeStoredCart(window.localStorage,items);window.dispatchEvent(new Event(COMMERCE_CART_EVENT));return clean;}

export function PurchaseCartLink({compact=false}:{compact?:boolean}){
 const count=useCartCount();
 return <Link href="/shop/cart" aria-label={`سلة المشتريات، ${count} منتج`} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#16294a]/20 bg-white px-3 py-2 text-sm font-extrabold text-[#16294a] ${compact?'shrink-0':''}`}><ShoppingCart className="h-5 w-5" aria-hidden="true"/>{!compact&&'السلة'}<span className="min-w-6 rounded-full bg-[#16294a] px-2 py-0.5 text-xs text-white">{count}</span></Link>;
}

export function AddCommerceCartItem({productId,variants,requiresVariant,maximum,selectedVariantKey,onVariantChange}:{productId:string;variants:{key:string;name:string;priceMinor:number;stock:number;options:string[];attributes?:Record<string,string>;sku?:string|null;vid?:string|null;image?:string|null;originalPriceMinor?:number|null;shippingMinor?:number|null;deliveryEstimate?:string|null}[];requiresVariant:boolean;maximum:number;selectedVariantKey?:string;onVariantChange?:(key:string)=>void}){
 const[internalSelected,setInternalSelected]=useState(''),[quantity,setQuantity]=useState('1'),[status,setStatus]=useState(''),[checking,setChecking]=useState(false);
 const selected=selectedVariantKey??internalSelected,variant=variants.find(item=>item.key===selected),mustSelect=requiresVariant;
 async function add(){
  if(checking)return;setChecking(true);setStatus('');
  try{
   const qty=Number(quantity);if(!Number.isSafeInteger(qty)||qty<1||qty>(variant?.stock??maximum))throw new Error('quantity');
   if(mustSelect&&!variant)throw new Error('variant');
   const verify=await fetch('/api/shop/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{productId,quantity:qty,...(variant?{variantKey:variant.key}:{})}]}),cache:'no-store'});
   if(!verify.ok)throw new Error('quote');const quote=await verify.json() as {lines?:{available:boolean;saudiShippingAvailable:boolean;unitPriceMinor:number;stock:number}[]};const line=quote.lines?.[0];
   if(!line?.available||!line.saudiShippingAvailable||qty>line.stock||line.unitPriceMinor!==variant?.priceMinor&&variant)throw new Error('quote');
   const current=readClientCart();
   const next=addCartLine(current,{productId,quantity:qty,...(variant?{variantKey:variant.key}:{})});
   publishCart(next);setStatus('أُضيف المنتج إلى السلة.');
  }catch(error){setStatus(error instanceof Error&&error.message==='variant'?'اختر اللون أو المقاس قبل الإضافة.':error instanceof Error&&error.message==='quote'?'تعذر التحقق من السعر أو المخزون أو الشحن. حدّث المنتج ثم حاول مجددًا.':'تعذر الإضافة؛ تحقق من الكمية أو حد السلة.');}
  finally{setChecking(false);}
 }
 const cap=variant?.stock??maximum;
 return <div className="space-y-3">
  {mustSelect&&<label className="block text-sm font-bold text-[#16294a]">اختر اللون أو المقاس أو الخيار
   <select value={selected} onChange={event=>{setInternalSelected(event.target.value);onVariantChange?.(event.target.value);}} required className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
    <option value="">اختر الخيار</option>{variants.map(item=><option key={item.key} value={item.key}>{item.name}{item.options.length&&item.options.join(' / ')!==item.name?` — ${item.options.join(' / ')}`:''} — المتاح {item.stock}</option>)}
   </select>
  </label>}
  {variant&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs" aria-live="polite"><p className="font-extrabold text-emerald-900">المتغير المحدد · {money(variant.priceMinor)} · متاح {variant.stock}</p>{(variant.vid||variant.sku)&&<p className="mt-1 text-slate-700">{variant.vid?`VID: ${variant.vid}`:''}{variant.vid&&variant.sku?' · ':''}{variant.sku?`SKU: ${variant.sku}`:''}</p>}{Object.entries(variant.attributes||{}).length>0&&<dl className="mt-2 grid grid-cols-2 gap-1">{Object.entries(variant.attributes!).map(([key,value])=><div key={`${key}-${value}`} className="flex gap-1"><dt className="font-bold">{key}:</dt><dd>{value}</dd></div>)}</dl>}{variant.deliveryEstimate&&<p className="mt-1">التوصيل المتوقع: {variant.deliveryEstimate}</p>}</div>}
  <div className="flex flex-wrap items-end gap-3">
   <label className="text-sm font-bold">الكمية<input type="number" min={1} max={cap} step={1} value={quantity} onChange={event=>setQuantity(event.target.value)} className="mt-1 block h-12 w-24 rounded-xl border border-slate-300 px-3"/></label>
   <button data-add-commerce-cart type="button" onClick={add} disabled={checking||mustSelect&&!variant} className="min-h-12 flex-1 rounded-xl bg-[#ff6a1a] px-5 text-sm font-extrabold text-white shadow-sm hover:bg-[#ea5c10] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">{checking?'جارٍ التحقق…':'أضف إلى السلة'}</button>
  </div>
  <p role="status" aria-live="polite" className="min-h-5 text-sm font-bold text-emerald-700">{status}</p>
 </div>;
}

type CartAddress={id:string;label:string;isDefault:boolean;snapshot:SaudiAddressSnapshot};
export function PurchaseCart({addresses,signedIn}:{addresses:CartAddress[];signedIn:boolean}){
 const[items,setItems]=useState<CartLine[]>([]),[quote,setQuote]=useState<Quote|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const persistQueue=useRef<Promise<void>>(Promise.resolve());
 const[selectedAddress,setSelectedAddress]=useState(addresses.find(address=>address.isDefault)?.id||addresses[0]?.id||'');
 const[addrConfirmed,setAddrConfirmed]=useState(false);
 async function refresh(lines:CartLine[]){
  if(!lines.length){setQuote(null);setLoading(false);return;}
  setLoading(true);setError('');
  try{const response=await fetch('/api/shop/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:lines}),cache:'no-store'});if(!response.ok)throw new Error('unavailable');const data=await response.json() as Quote;setQuote(data);}
  catch{setError('لم نتمكن من تحديث الأسعار والتوفر الآن. أعد المحاولة قبل متابعة الشراء.');setQuote(null);}
  finally{setLoading(false);}
 }
 function save(next:CartLine[]){const clean=publishCart(next);setItems(clean);void refresh(clean);if(signedIn){persistQueue.current=persistQueue.current.catch(()=>{}).then(async()=>{const response=await fetch('/api/shop/cart/state',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:clean})});if(!response.ok)throw new Error('cart_sync');});}}
 useEffect(()=>{let cancelled=false;async function load(){let local:CartLine[]=[];try{local=readClientCart();}catch{try{window.localStorage.removeItem(COMMERCE_CART_STORAGE_KEY);}catch{}publishCart([]);}
   if(signedIn){try{const response=await fetch('/api/shop/cart/state',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:local})});if(!response.ok)throw new Error('cart_sync');const data=await response.json() as {items:CartLine[]};local=mergeCartLines(local,normalizeCart(data.items));publishCart(local);const saved=await fetch('/api/shop/cart/state',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:local})});if(!saved.ok)throw new Error('cart_sync');}catch{if(!cancelled)setError('تعذر مزامنة سلتك مع حسابك الآن؛ تبقى السلة المحفوظة على هذا الجهاز متاحة.');}}
   if(cancelled)return;setItems(local);void refresh(local);
  }void load();return()=>{cancelled=true;};},[signedIn]);
 const invalid=!!quote?.lines.some(line=>!line.available);
 const selAddr=addresses.find(a=>a.id===selectedAddress);
 const totalLabel=quote?.totalMinor===null||quote?.totalMinor===undefined?'غير محسوب':money(quote.totalMinor);
 return <div className="mx-auto max-w-xl space-y-3 px-1 pb-28">
  {/* ===== عنوان الشحن (من ملف العضو) — تعديل + تأكيد ===== */}
  <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
   <div className="flex items-center justify-between gap-2">
    <h2 className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#16294a]"><MapPin className="h-4 w-4 text-[#16294a]"/>عنوان الشحن</h2>
    <Link href={signedIn?'/account/addresses':'/login'} className="shrink-0 text-xs font-bold text-[#16294a] underline">{addresses.length?'تعديل':'إضافة عنوان'}</Link>
   </div>
   {!signedIn?<p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs font-bold text-amber-900">سجّل الدخول لاستخدام عنوانك المحفوظ.</p>
    :addresses.length===0?<p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs font-bold text-amber-900">أضف عنوان شحن سعودياً إلى حسابك أولاً.</p>
    :<>
     {addresses.length>1&&<select aria-label="اختر عنوان الشحن" value={selectedAddress} onChange={event=>{setSelectedAddress(event.target.value);setAddrConfirmed(false);}} className="mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] font-bold">{addresses.map(address=><option key={address.id} value={address.id}>{address.label}{address.isDefault?' · افتراضي':''} — {address.snapshot.city}</option>)}</select>}
     {selAddr&&<p className="mt-2 text-[13px] font-semibold leading-6 text-slate-700"><b className="text-[#16294a]">{selAddr.snapshot.fullName}</b> · {selAddr.snapshot.phone}<br/><span className="text-slate-500">{[selAddr.snapshot.region,selAddr.snapshot.city,selAddr.snapshot.district,selAddr.snapshot.street,selAddr.snapshot.buildingNumber,selAddr.snapshot.postalCode].filter(Boolean).join('، ')}</span></p>}
     <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-bold text-[#16294a]"><input type="checkbox" checked={addrConfirmed} onChange={event=>setAddrConfirmed(event.target.checked)} className="h-4 w-4 accent-[#16294a]"/>أؤكّد صحة عنوان الشحن</label>
    </>}
  </section>

  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
  {loading&&<p className="rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-600">جارٍ تحديث المنتجات والأسعار…</p>}
  {!loading&&items.length===0&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-bold text-slate-700">سلتك فارغة الآن.</p><Link href="/shop" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#16294a] px-5 font-bold text-white">تصفّح المنتجات</Link></div>}

  {/* ===== المنتجات (مختصرة: صورة صغيرة · عنوان · كمية · سعر) ===== */}
  {!!quote?.lines.length&&<section className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{quote.lines.map((line,index)=><div key={`${line.productId}-${line.variantKey||''}-${index}`} className="flex gap-2.5 p-3">
   <Link href={`/shop/${line.productId}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">{line.image?<img src={line.image} alt="" loading="lazy" className="h-full w-full object-contain"/>:<span className="grid h-full place-items-center text-[10px] text-slate-400">—</span>}</Link>
   <div className="min-w-0 flex-1">
    <Link href={`/shop/${line.productId}`} className="line-clamp-2 text-[13px] font-bold leading-[1.4] text-[#16294a]">{line.title}</Link>
    {line.variantName&&<p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500" dir="auto">{line.variantName}</p>}
    {!line.available&&<p className="mt-0.5 text-[11px] font-bold text-red-700">غير متوفر حالياً</p>}
    <div className="mt-1 flex items-center justify-between gap-2">
     <div className="flex items-center rounded-lg border border-slate-300">
      <button type="button" aria-label={line.quantity<=1?'إزالة المنتج':'إنقاص'} onClick={()=>line.quantity<=1?save(removeCartLine(items,line.productId,line.variantKey)):save(setCartQuantity(items,line.productId,line.quantity-1,line.variantKey))} className="h-8 w-8 text-lg font-black text-[#16294a]">−</button>
      <span className="w-8 border-x border-slate-200 text-center text-[13px] font-bold">{line.quantity}</span>
      <button type="button" disabled={!line.available||line.quantity>=line.stock} aria-label="زيادة" onClick={()=>save(setCartQuantity(items,line.productId,line.quantity+1,line.variantKey))} className="h-8 w-8 text-lg font-black text-[#16294a] disabled:opacity-40">+</button>
     </div>
     <b className="text-sm font-extrabold text-[#c4510b]">{money(line.totalMinor)}</b>
    </div>
   </div>
  </div>)}</section>}

  {/* ===== شريط الدفع الثابت: الإجمالي + «ادفع» ===== */}
  {items.length>0&&<div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,.08)] backdrop-blur">
   <div className="mx-auto flex max-w-xl items-center gap-3">
    <div className="min-w-0"><p className="text-[10px] font-bold text-slate-500">الإجمالي</p><p className="truncate text-base font-black text-[#c4510b]">{totalLabel}</p></div>
    {quote?.purchasingEnabled
     ?<button type="button" disabled={invalid||!selAddr||!addrConfirmed} className="min-h-12 flex-1 rounded-xl bg-[#c4510b] px-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{!selAddr?'أضف عنواناً':!addrConfirmed?'أكّد العنوان':'ادفع'}</button>
     :<button type="button" disabled aria-disabled="true" className="min-h-12 flex-1 cursor-not-allowed rounded-xl bg-slate-300 px-4 text-base font-extrabold text-slate-600">الدفع غير متاح حالياً</button>}
   </div>
  </div>}
 </div>;
}
