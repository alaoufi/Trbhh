'use client';

import {useEffect,useId,useMemo,useState} from 'react';
import {formatSar} from '@/lib/commerce/money';
import {cjVariantDisplayOptions,type DisplayOption} from '@/lib/cj/variant-display';
import {addTrialCartItem,type TrialCartSnapshot} from '@/lib/cj/trial-cart';
import {CartLink,useTrialCart} from './cart-controls';
import type {CjVariant} from '@/lib/cj/types';

type Variant=CjVariant;
type Check={status:'available';vid:string;sku:string;variantName:string|null;optionKey:string|null;stockQuantity:number;priceChanged:boolean;warehouses:{id:string|null;name:string|null;quantity:number;originCountry:string}[];supplierPriceMinor:number;salePriceMinor:number;shippingOptions:{name:string;priceMinor:number;additionalMinor:number;vatEnabled:boolean;vatMinor:number;totalMinor:number;currency:'SAR';deliveryDays:string|null;originCountry:string}[];checkedAt:string}|{status:'out_of_stock'|'quantity_exceeds_stock'|'inventory_error'|'variant_changed'|'no_shipping'|'freight_error'|'invalid_price'|'verification_failed';checkedAt:string};
const failureMessage:Record<string,string>={checking:'جاري التحقق من المخزون والشحن...',out_of_stock:'غير متوفر حاليًا',quantity_exceeds_stock:'الكمية المطلوبة أكبر من المخزون المتاح',inventory_error:'تعذّر التحقق من المخزون، حاول مرة أخرى',variant_changed:'تغيّرت بيانات الخيار، حدّث الصفحة واختره مجدّداً',no_shipping:'لا يوجد شحن متاح للسعودية لهذا الخيار',freight_error:'تعذّر الحصول على سعر الشحن، حاول مرة أخرى',invalid_price:'تعذّر التحقق من السعر الحالي، لا يمكن الإضافة'};
const money=(minor:number)=>`${formatSar(minor)} ر.س`;

export function CjPurchasePanel({productId,productPid,productName,variants,accountId,isStaff,labels,optionsByVid}:{productId:number;productPid:string;productName:string;variants:Variant[];accountId:number;isStaff:boolean;labels?:Record<string,string>;optionsByVid?:Record<string,DisplayOption[]>}){
  const {items,ready,save,latest}=useTrialCart(accountId),id=useId();
  const [variantId,setVariantId]=useState(''),[qty,setQty]=useState(1),[status,setStatus]=useState(''),[check,setCheck]=useState<Check|null>(null),[shipping,setShipping]=useState(0),[notice,setNotice]=useState(''),[added,setAdded]=useState(false);
  // التسميات مُترجمة مسبقاً من الخادم (الإجراء الموحّد). عند غياب خيار واضح (رقم مجرّد) نُلحق
  // رمز السلعة SKU ليتمكّن المستخدم من التمييز بدل «الخيار N» غير المفيد.
  const labelFor=(variant:Variant,index:number)=>{
    const base=labels?.[variant.vid]||cjVariantDisplayOptions(variant).map(o=>`${o.label}: ${o.value}`).join(' · ');
    if(base&&!/^الخيار \d+$/.test(base))return base;
    return `الخيار ${index+1}${variant.variantSku?` · ${variant.variantSku}`:''}`;
  };
  const selected=variants.find(item=>item.vid===variantId),selectedIndex=variants.findIndex(item=>item.vid===variantId);
  const options=useMemo(()=>selected?(optionsByVid?.[selected.vid]??cjVariantDisplayOptions(selected)):[],[selected,optionsByVid]);
  // نموذج اختيار بالسمات (لون/مقاس) عندما تحمل كل المتغيّرات نفس مجموعة الخيارات الواضحة؛
  // فيختار المستخدم كل سمة على حدة وتُحلّ إلى متغيّر. وإلا نعود للقائمة المنسدلة الكاملة.
  const selector=useMemo(()=>{
    const per=variants.map(v=>({vid:v.vid,opts:(optionsByVid?.[v.vid]??cjVariantDisplayOptions(v))}));
    if(per.length<2||per.some(p=>!p.opts.length))return null;
    const groupLabels=per[0].opts.map(o=>o.label);
    if(!groupLabels.length||groupLabels.length>3||groupLabels.includes('الخيار'))return null;
    const consistent=per.every(p=>p.opts.length===groupLabels.length&&groupLabels.every(l=>p.opts.some(o=>o.label===l)));
    if(!consistent)return null;
    const groups=groupLabels.map(label=>({label,values:[...new Set(per.flatMap(p=>p.opts.filter(o=>o.label===label).map(o=>o.value)))]}));
    const combo=new Map<string,string>();
    for(const p of per)combo.set(groupLabels.map(l=>p.opts.find(o=>o.label===l)?.value??'').join('\u0000'),p.vid);
    return {groups,groupLabels,combo};
  },[variants,optionsByVid]);
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const comboComplete=!!selector&&selector.groupLabels.every(l=>chosen[l]);
  useEffect(()=>{
    if(!selector)return;
    setVariantId(comboComplete?(selector.combo.get(selector.groupLabels.map(l=>chosen[l]).join('\u0000'))??''):'');
  },[chosen,selector,comboComplete]);
  const alreadyInCart=items.find(item=>item.id===productId&&item.variantId===variantId)?.qty??0;
  const verificationQuantity=qty+alreadyInCart;
  useEffect(()=>{
    if(!selected){setStatus('');setCheck(null);return;}
    let active=true;const controller=new AbortController();setStatus('checking');setCheck(null);setNotice('');setAdded(false);
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/cj/products/${productId}/verify-variant`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({variantId:selected.vid,quantity:verificationQuantity}),signal:controller.signal});
        const data=await response.json() as Check;
        if(!active)return;setStatus(response.ok?data.status:data.status||'verification_failed');setCheck(data);setShipping(0);
      }catch{if(active){setStatus('verification_failed');setCheck(null);}}
    },200);
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[productId,selected,qty,verificationQuantity]);
  const quote=check?.status==='available'?check:null;
  // ترتيب شركات الشحن حسب إجمالي الشحن (الأساسي + الإضافي) تصاعدياً — الأرخص أولاً وهو الافتراضي.
  const shipSorted=useMemo(()=>quote?[...quote.shippingOptions].sort((a,b)=>(a.priceMinor+a.additionalMinor)-(b.priceMinor+b.additionalMinor)):[],[quote]);
  const ship=shipSorted[shipping],total=ship?.totalMinor??null;
  // حدّ الكمية بالمخزون المتاح (ناقص ما في السلة) فلا يتجاوز الطلب المخزون الفعلي.
  const maxQty=quote?Math.max(1,quote.stockQuantity-alreadyInCart):99;
  useEffect(()=>{if(qty>maxQty)setQty(maxQty);},[maxQty,qty]);
  function add(){
    if(!quote||!ship||!selected||!ready)return;
    const previous=latest().find(item=>item.id===productId&&item.variantId===selected.vid)?.qty??0;
    const attributes=Object.fromEntries(Object.entries(selected.attributes??{}).filter((entry):entry is [string,string|number|boolean]=>['string','number','boolean'].includes(typeof entry[1])));
    const snapshot:TrialCartSnapshot={pid:productPid,vid:selected.vid,sku:quote.sku,productName,rawVariantName:selected.variantName||'',optionKey:selected.variantKey||'',displayLabel:labelFor(selected,selectedIndex).slice(0,500),attributes,verifiedQuantity:verificationQuantity,unitMinor:quote.salePriceMinor,stockQuantity:quote.stockQuantity,shippingName:ship.name,shippingMinor:ship.priceMinor,shippingAdditionalMinor:ship.additionalMinor,vatEnabled:ship.vatEnabled,vatMinor:ship.vatMinor,totalMinor:ship.totalMinor,deliveryDays:ship.deliveryDays,originCountry:ship.originCountry,checkedAt:quote.checkedAt};
    try{save(addTrialCartItem(latest(),{id:productId,qty,variantId:selected.vid,snapshot}),'أُضيف الخيار بعد التحقق إلى سلة التجربة.');setNotice('');setAdded(true);}catch{setNotice('تعذر الإضافة. تأكد من الكمية وحدود السلة.');}
  }
  return <section aria-label="خيارات الشراء التجريبي" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
    <h2 className="font-extrabold text-primary">اختر المنتج</h2>
    {selector
      ? <div className="space-y-3">{selector.groups.map(group=><div key={group.label}>
          <p className="mb-1.5 text-sm font-bold text-slate-700">{group.label}</p>
          <div className="flex flex-wrap gap-2">{group.values.map(val=><button key={val} type="button" onClick={()=>setChosen(c=>({...c,[group.label]:val}))} aria-pressed={chosen[group.label]===val} dir="auto" className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${chosen[group.label]===val?'border-primary bg-primary text-white shadow-sm':'border-slate-300 bg-white text-slate-700 hover:border-primary/50'}`}>{val}</button>)}</div>
        </div>)}
        {comboComplete&&!selected&&<p role="status" className="text-sm font-bold text-amber-800">هذا التركيب غير متوفّر — اختر تركيباً آخر.</p>}
      </div>
      : <label htmlFor={`${id}-variant`} className="block text-sm font-bold">الخيار المتاح
          <select id={`${id}-variant`} value={variantId} onChange={event=>setVariantId(event.target.value)} className="mt-2 block min-h-12 w-full max-w-full rounded-xl border border-slate-300 bg-white px-3" required>
            <option value="">اختر الخيار</option>{variants.map((variant,index)=><option key={variant.vid||index} value={variant.vid}>{labelFor(variant,index)}</option>)}
          </select>
        </label>}
    {selected&&<div className="grid grid-cols-2 gap-2 text-sm">{options.map((option,index)=><div key={`${option.label}-${index}`} className="min-w-0 rounded-lg bg-slate-50 p-2"><span className="block text-xs text-slate-500">{option.label}</span><b className="break-words" dir="auto">{option.value}</b></div>)}{selected.variantWeight!=null&&<div className="rounded-lg bg-slate-50 p-2"><span className="block text-xs text-slate-500">الوزن</span><b>{selected.variantWeight} غ</b></div>}</div>}
    <p role="status" aria-live="polite" className={`text-sm font-bold ${quote?'text-emerald-700':'text-amber-800'}`}>{quote?`${quote.priceChanged?'تم تحديث السعر · ':''}متوفر · الكمية المتاحة: ${quote.stockQuantity}`:failureMessage[status]|| (status==='verification_failed'?'تعذّر التحقق، حاول مرة أخرى':status?`تعذّر التحقق من الخيار (${status})`:'اختر اللون أو المقاس لبدء التحقق')}</p>
    {quote&&<div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
      {/* السعر المعروض هو سعر المنتج النهائي (شامل ربح تربح) — ما يهمّ العميل. تفاصيل التكلفة
          والمستودعات للإدارة فقط داخل قسم قابل للطيّ. */}
      <p className="text-slate-700">سعر المنتج: <b className="text-lg text-emerald-800" dir="ltr">{money(quote.salePriceMinor)} ر.س</b></p>
      {isStaff&&<details className="rounded-lg border border-slate-200 bg-white/60 px-3 text-xs"><summary className="cursor-pointer py-2 font-bold text-slate-600">تفاصيل الإدارة (التكلفة والمستودعات)</summary><div className="space-y-2 pb-2"><p>التكلفة (سعر CJ): <b dir="ltr">{money(quote.supplierPriceMinor)} ر.س</b> · الربح: <b dir="ltr">{money(quote.salePriceMinor-quote.supplierPriceMinor)} ر.س</b></p>{quote.warehouses.length>0&&<div><p className="mb-1 font-semibold text-slate-600">المخزون حسب المستودعات</p><ul className="flex flex-wrap gap-2">{quote.warehouses.map(warehouse=><li key={`${warehouse.id}-${warehouse.originCountry}`} className="rounded-full bg-white px-3 py-1">{warehouse.name||warehouse.originCountry}: {warehouse.quantity}</li>)}</ul></div>}</div></details>}
      <div>
        <p className="mb-1.5 font-bold">شركة الشحن إلى السعودية</p>
        {/* قائمة اختيار منسّقة بدل القائمة المنسدلة: شركة · سعر · مدة، بخط صغير وفواصل وخلفية متبادلة. */}
        <ul className="overflow-hidden rounded-xl border border-slate-200">
          {shipSorted.map((option,index)=>{const shipMinor=option.priceMinor+option.additionalMinor;const days=option.deliveryDays?(/[A-Za-z؀-ۿ]/.test(option.deliveryDays)?option.deliveryDays:`${option.deliveryDays} يوم`):'';return (
            <li key={`${option.name}-${option.originCountry}-${index}`} className={`border-b border-slate-100 last:border-0 ${index%2===0?'bg-slate-50':'bg-white'} ${shipping===index?'ring-1 ring-inset ring-primary':''}`}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
                <input type="radio" name={`${id}-ship`} checked={shipping===index} onChange={()=>setShipping(index)} className="h-4 w-4 shrink-0 accent-primary" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] text-slate-800" dir="auto">{option.name}</b>
                  <span className="block text-[11px] text-slate-500"><b dir="ltr">{shipMinor===0?'مجاني':`${money(shipMinor)} ر.س`}</b>{days?` · ${days}`:''}</span>
                </span>
              </label>
            </li>
          );})}
        </ul>
      </div>
      {/* تفصيل شفّاف للإجمالي حتى يتّضح سبب الرقم: السلع (السعر×الكمية) + الشحن + الرسوم + الضريبة. */}
      <div className="space-y-1 rounded-lg bg-white/70 p-2">
        <p className="flex justify-between"><span>السلع (السعر × {verificationQuantity})</span><b dir="ltr">{money(quote.salePriceMinor*verificationQuantity)} ر.س</b></p>
        <p className="flex justify-between"><span>الشحن</span><b dir="ltr">{ship?(ship.priceMinor+ship.additionalMinor===0?'مجاني':`${money(ship.priceMinor+ship.additionalMinor)} ر.س`):'—'}</b></p>
        {ship?.vatEnabled&&<p className="flex justify-between"><span>ضريبة القيمة المضافة</span><b dir="ltr">{money(ship.vatMinor)} ر.س</b></p>}
        {ship?.deliveryDays&&<p className="flex justify-between"><span>مدّة الشحن</span><b dir="auto">{/[A-Za-z؀-ۿ]/.test(ship.deliveryDays)?ship.deliveryDays:`${ship.deliveryDays} يوم`}</b></p>}
        <p className="flex justify-between border-t border-emerald-200 pt-1.5 text-base"><span className="font-bold">الإجمالي</span><b className="text-xl text-emerald-800" dir="ltr">{total==null?'—':`${money(total)} ر.س`}</b></p>
      </div>
      <p className="text-xs text-slate-600">محسوب لكمية {verificationQuantity} بعد التحقق الحيّ من CJ. يُعاد التحقق قبل الدفع. (التكلفة = سعر CJ؛ سعر المنتج = التكلفة + هامش تربح؛ الإجمالي = السلع + الشحن{ship?.vatEnabled?' + الضريبة':''}).</p>
    </div>}
    <div className="flex flex-wrap items-end gap-2"><label htmlFor={`${id}-qty`} className="text-sm font-bold">الكمية{quote&&<span className="ms-1 text-xs font-normal text-slate-500">(المتاح: {maxQty})</span>}<input id={`${id}-qty`} type="number" min={1} max={maxQty} value={qty} onChange={event=>setQty(Math.max(1,Math.min(maxQty,Number(event.target.value)||1)))} className="mt-1 block min-h-11 w-24 rounded-lg border px-3" /></label><button type="button" disabled={!ready||!quote||!ship||!isStaff} onClick={add} className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{!isStaff?'للإدارة فقط':(selector?!comboComplete:!variantId)?'اختر الخيار أولاً':status==='checking'?'جارٍ التحقق…':!quote?'غير متاح حالياً':!ship?'لا شحن متاح':'أضف إلى السلة'}</button><CartLink accountId={accountId}/></div>
    {notice&&<p role="alert" className="text-sm text-red-700">{notice}</p>}
    {added&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3"><span className="text-sm font-bold text-emerald-800">✓ أُضيف إلى السلة</span><a href="/cj/cart" className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white">اذهب إلى السلة والدفع ←</a></div>}
    <p className="text-xs leading-6 text-slate-600">شراء خاص بالإدارة: أضِف الخيار المتحقّق إلى السلة، ثم من السلة يُنشأ الطلب ويُعتمد ويُدفع من المحفظة ويُتابع حتى التسليم.</p>
  </section>;
}
