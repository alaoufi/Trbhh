'use client';

import {useEffect,useId,useMemo,useState} from 'react';
import {formatSar} from '@/lib/commerce/money';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
import {addTrialCartItem,type TrialCartSnapshot} from '@/lib/cj/trial-cart';
import {CartLink,useTrialCart} from './cart-controls';
import type {CjVariant} from '@/lib/cj/types';

type Variant=CjVariant;
type Check={status:'available';vid:string;sku:string;variantName:string|null;optionKey:string|null;stockQuantity:number;priceChanged:boolean;warehouses:{id:string|null;name:string|null;quantity:number;originCountry:string}[];supplierPriceMinor:number;salePriceMinor:number;shippingOptions:{name:string;priceMinor:number;additionalMinor:number;vatEnabled:boolean;vatMinor:number;totalMinor:number;currency:'SAR';deliveryDays:string|null;originCountry:string}[];checkedAt:string}|{status:'out_of_stock'|'quantity_exceeds_stock'|'inventory_error'|'variant_changed'|'no_shipping'|'freight_error'|'invalid_price'|'verification_failed';checkedAt:string};
const failureMessage:Record<string,string>={checking:'جاري التحقق من المخزون والشحن...',out_of_stock:'غير متوفر حاليًا',quantity_exceeds_stock:'الكمية المطلوبة أكبر من المخزون المتاح',inventory_error:'تعذّر التحقق من المخزون، حاول مرة أخرى',variant_changed:'تغيّرت بيانات الخيار، حدّث الصفحة واختره مجدّداً',no_shipping:'لا يوجد شحن متاح للسعودية لهذا الخيار',freight_error:'تعذّر الحصول على سعر الشحن، حاول مرة أخرى',invalid_price:'تعذّر التحقق من السعر الحالي، لا يمكن الإضافة'};
const money=(minor:number)=>`${formatSar(minor)} ر.س`;

export function CjPurchasePanel({productId,productPid,productName,variants,accountId,isStaff}:{productId:number;productPid:string;productName:string;variants:Variant[];accountId:number;isStaff:boolean}){
  const {items,ready,save,latest}=useTrialCart(accountId),id=useId();
  const [variantId,setVariantId]=useState(''),[qty,setQty]=useState(1),[status,setStatus]=useState(''),[check,setCheck]=useState<Check|null>(null),[shipping,setShipping]=useState(0),[notice,setNotice]=useState('');
  const selected=variants.find(item=>item.vid===variantId),options=useMemo(()=>selected?cjVariantDisplayOptions(selected):[],[selected]);
  const alreadyInCart=items.find(item=>item.id===productId&&item.variantId===variantId)?.qty??0;
  const verificationQuantity=qty+alreadyInCart;
  useEffect(()=>{
    if(!selected){setStatus('');setCheck(null);return;}
    let active=true;const controller=new AbortController();setStatus('checking');setCheck(null);setNotice('');
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/cj/products/${productId}/verify-variant`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({variantId:selected.vid,quantity:verificationQuantity}),signal:controller.signal});
        const data=await response.json() as Check;
        if(!active)return;setStatus(response.ok?data.status:data.status||'verification_failed');setCheck(data);setShipping(0);
      }catch{if(active){setStatus('verification_failed');setCheck(null);}}
    },200);
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[productId,selected,qty,verificationQuantity]);
  const quote=check?.status==='available'?check:null,ship=quote?.shippingOptions[shipping],total=ship?.totalMinor??null;
  function add(){
    if(!quote||!ship||!selected||!ready)return;
    const previous=latest().find(item=>item.id===productId&&item.variantId===selected.vid)?.qty??0;
    const attributes=Object.fromEntries(Object.entries(selected.attributes??{}).filter((entry):entry is [string,string|number|boolean]=>['string','number','boolean'].includes(typeof entry[1])));
    const snapshot:TrialCartSnapshot={pid:productPid,vid:selected.vid,sku:quote.sku,productName,rawVariantName:selected.variantName||'',optionKey:selected.variantKey||'',attributes,verifiedQuantity:verificationQuantity,unitMinor:quote.salePriceMinor,stockQuantity:quote.stockQuantity,shippingName:ship.name,shippingMinor:ship.priceMinor,shippingAdditionalMinor:ship.additionalMinor,vatEnabled:ship.vatEnabled,vatMinor:ship.vatMinor,totalMinor:ship.totalMinor,deliveryDays:ship.deliveryDays,originCountry:ship.originCountry,checkedAt:quote.checkedAt};
    try{save(addTrialCartItem(latest(),{id:productId,qty,variantId:selected.vid,snapshot}),'أُضيف الخيار بعد التحقق إلى سلة التجربة.');setNotice('');}catch{setNotice('تعذر الإضافة. تأكد من الكمية وحدود السلة.');}
  }
  return <section aria-label="خيارات الشراء التجريبي" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
    <h2 className="font-extrabold text-primary">اختر المنتج</h2>
    <label htmlFor={`${id}-variant`} className="block text-sm font-bold">اللون والمقاس أو الخيار المتاح
      <select id={`${id}-variant`} value={variantId} onChange={event=>setVariantId(event.target.value)} className="mt-2 block min-h-12 w-full max-w-full rounded-xl border border-slate-300 bg-white px-3" required>
        <option value="">اختر الخيار</option>{variants.map((variant,index)=>{const parsed=cjVariantDisplayOptions(variant);const label=parsed.map(option=>`${option.label}: ${option.value}`).join(' · ')||`الخيار ${index+1}`;return <option key={variant.vid||index} value={variant.vid}>{label}</option>;})}
      </select>
    </label>
    {selected&&<div className="grid grid-cols-2 gap-2 text-sm">{options.map((option,index)=><div key={`${option.label}-${index}`} className="min-w-0 rounded-lg bg-slate-50 p-2"><span className="block text-xs text-slate-500">{option.label}</span><b className="break-words" dir="auto">{option.value}</b></div>)}{selected.variantWeight!=null&&<div className="rounded-lg bg-slate-50 p-2"><span className="block text-xs text-slate-500">الوزن</span><b>{selected.variantWeight} غ</b></div>}</div>}
    <p role="status" aria-live="polite" className={`text-sm font-bold ${quote?'text-emerald-700':'text-amber-800'}`}>{quote?`${quote.priceChanged?'تم تحديث السعر · ':''}متوفر · الكمية المتاحة: ${quote.stockQuantity}`:failureMessage[status]|| (status==='verification_failed'?'تعذّر التحقق، حاول مرة أخرى':status?`تعذّر التحقق من الخيار (${status})`:'اختر اللون أو المقاس لبدء التحقق')}</p>
    {quote&&<div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
      {isStaff&&<p>التكلفة: <b>{money(quote.supplierPriceMinor)}</b></p>}
      <p>سعر المنتج: <b className="text-lg text-emerald-800">{money(quote.salePriceMinor)}</b></p>
      {isStaff&&quote.warehouses.length>0&&<div><p className="mb-1 text-xs font-semibold text-slate-600">المخزون حسب المستودعات (للإدارة)</p><ul className="flex flex-wrap gap-2">{quote.warehouses.map(warehouse=><li key={`${warehouse.id}-${warehouse.originCountry}`} className="rounded-full bg-white px-3 py-1 text-xs">{warehouse.name||warehouse.originCountry}: {warehouse.quantity}</li>)}</ul></div>}
      <div><label htmlFor={`${id}-shipping`} className="font-bold">الشحن إلى السعودية</label><select id={`${id}-shipping`} value={shipping} onChange={event=>setShipping(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-2">{quote.shippingOptions.map((option,index)=><option key={`${option.name}-${option.originCountry}-${index}`} value={index}>{option.name} · مستودع {option.originCountry} · {money(option.priceMinor+option.additionalMinor)}{option.deliveryDays?` · ${option.deliveryDays}`:''}</option>)}</select></div>
      {ship?.deliveryDays&&<p>مدّة الشحن: <b dir="auto">{ship.deliveryDays}</b></p>}
      {ship&&ship.additionalMinor>0&&<p className="flex justify-between"><span>رسوم إضافية</span><b>{money(ship.additionalMinor)}</b></p>}
      {ship?.vatEnabled&&<p className="flex justify-between"><span>ضريبة القيمة المضافة</span><b>{money(ship.vatMinor)}</b></p>}
      <p className="flex justify-between border-t border-emerald-200 pt-2 text-base"><span>الإجمالي بعد الرسوم والضريبة</span><b className="text-xl text-emerald-800">{total==null?'—':money(total)}</b></p>
      <p className="text-xs text-slate-600">السعر والشحن محسوبان لكمية {verificationQuantity} بعد التحقق الحي. لا ينشأ طلب أو حجز مخزون في وضع التجربة.</p>
    </div>}
    <div className="flex flex-wrap items-end gap-2"><label htmlFor={`${id}-qty`} className="text-sm font-bold">الكمية<input id={`${id}-qty`} type="number" min={1} max={quote?.stockQuantity??99} value={qty} onChange={event=>setQty(Math.max(1,Math.min(99,Number(event.target.value)||1)))} className="mt-1 block min-h-11 w-24 rounded-lg border px-3" /></label><button type="button" disabled={!ready||!quote||!ship||!isStaff} onClick={add} className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">أضف لسلة التجربة</button><CartLink accountId={accountId}/></div>
    {notice&&<p role="alert" className="text-sm text-red-700">{notice}</p>}
    <p className="text-xs leading-6 text-slate-600">هذه تجربة للسلة فقط: لا خصم ولا حجز للمخزون ولا طلب. الشراء الحقيقي مقفل من إعداد المنصة.</p>
  </section>;
}
