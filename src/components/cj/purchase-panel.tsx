'use client';

import {cjSizeOptionLabel,type CjSizeChart} from '@/lib/cj/size-chart';

import {useEffect,useId,useMemo,useState} from 'react';
import Link from 'next/link';
import {formatSar} from '@/lib/commerce/money';
import {cjVariantDisplayOptions,type DisplayOption} from '@/lib/cj/variant-display';
import {buildCjVariantSelector,resolveCjVariantSelection,groupCjVariantFamilies,cjVariantValues} from '@/lib/cj/variant-selector';
import {addTrialCartItem,type TrialCartSnapshot} from '@/lib/cj/trial-cart';
import {CartLink,useTrialCart} from './cart-controls';
import type {CjVariant} from '@/lib/cj/types';
import {CjText} from './cj-text';
import {quoteMatchesSelection,type VerifiedSelection} from '@/lib/cj/display-freshness';

type Variant=CjVariant;
type Check={status:'available';vid:string;sku:string;variantName:string|null;optionKey:string|null;stockQuantity:number;priceChanged:boolean;warehouses:{id:string|null;name:string|null;quantity:number;originCountry:string}[];supplierPriceMinor:number;salePriceMinor:number;shippingOptions:{name:string;priceMinor:number;additionalMinor:number;vatEnabled:boolean;vatMinor:number;totalMinor:number;currency:'SAR';deliveryDays:string|null;originCountry:string}[];checkedAt:string;destinationZip?:string}|{status:'out_of_stock'|'quantity_exceeds_stock'|'inventory_error'|'variant_changed'|'no_shipping'|'freight_error'|'invalid_price'|'verification_failed';checkedAt:string};
const failureMessage:Record<string,string>={checking:'جاري التحقق من المخزون والشحن...',destination_required:'أكمل عنوان الشحن والرمز البريدي في ملفك؛ لا تُعرض أرقام غير مؤكدة.',out_of_stock:'غير متوفر حاليًا',quantity_exceeds_stock:'الكمية المطلوبة أكبر من المخزون المتاح',inventory_error:'تعذّر التحقق من المخزون، حاول مرة أخرى',variant_changed:'تغيّرت بيانات الخيار، حدّث الصفحة واختره مجدّداً',no_shipping:'لا يوجد شحن متاح للسعودية لهذا الخيار',freight_error:'تعذّر الحصول على سعر الشحن، حاول مرة أخرى',invalid_price:'تعذّر التحقق من السعر الحالي، لا يمكن الإضافة'};
const money=(minor:number)=>`${formatSar(minor)} ر.س`;

export function CjPurchasePanel({productId,productPid,productName,variants,accountId,isStaff,labels,optionsByVid,sizeChart}:{productId:number;productPid:string;productName:string;variants:Variant[];accountId:number;isStaff:boolean;labels?:Record<string,string>;optionsByVid?:Record<string,DisplayOption[]>;sizeChart?:CjSizeChart|null}){
  const {items,ready,save,latest}=useTrialCart(accountId),id=useId();
  const [qty,setQty]=useState(1),[status,setStatus]=useState(''),[check,setCheck]=useState<Check|null>(null),[shipping,setShipping]=useState(0),[notice,setNotice]=useState(''),[added,setAdded]=useState(false);
  const [checkedSelection,setCheckedSelection]=useState<VerifiedSelection|null>(null);
  // التسميات مُترجمة مسبقاً من الخادم (الإجراء الموحّد). عند غياب خيار واضح (رقم مجرّد) نُلحق
  // رمز السلعة SKU ليتمكّن المستخدم من التمييز بدل «الخيار N» غير المفيد.
  const labelFor=(variant:Variant,index:number)=>{
    const base=labels?.[variant.vid]||cjVariantDisplayOptions(variant).map(o=>`${o.label}: ${o.value}`).join(' · ');
    if(base&&!/^الخيار \d+$/.test(base))return base;
    return `الخيار ${index+1}${variant.variantSku?` · ${variant.variantSku}`:''}`;
  };
  // نموذج اختيار بالسمات (لون/مقاس) عندما تحمل كل المتغيّرات نفس مجموعة الخيارات الواضحة؛
  // فيختار المستخدم كل سمة على حدة وتُحلّ إلى متغيّر. وإلا نعود للقائمة المنسدلة الكاملة.
  const families=useMemo(()=>groupCjVariantFamilies(variants.map(v=>({vid:v.vid,opts:optionsByVid?.[v.vid]??cjVariantDisplayOptions(v)}))),[variants,optionsByVid]);
  const [familyKey,setFamilyKey]=useState('');
  const family=families.length===1?families[0]:families.find(f=>f.key===familyKey);
  const familyVariants=family?variants.filter(v=>family.entries.some(e=>e.vid===v.vid)):[];
  const selector=useMemo(()=>family?buildCjVariantSelector(family.entries):null,[family]);
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const variantId=selector?resolveCjVariantSelection(selector,chosen):'';
  const selected=variants.find(item=>item.vid===variantId),selectedIndex=variants.findIndex(item=>item.vid===variantId);
  const options=useMemo(()=>selected?(optionsByVid?.[selected.vid]??cjVariantDisplayOptions(selected)):[],[selected,optionsByVid]);
  const alreadyInCart=items.find(item=>item.id===productId&&item.variantId===variantId)?.qty??0;
  const verificationQuantity=qty+alreadyInCart;
  useEffect(()=>{
    if(!selected){setStatus('');setCheck(null);setAdded(false);setNotice('');return;}
    let active=true;const controller=new AbortController();setStatus('checking');setCheck(null);setNotice('');setAdded(false);
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/cj/products/${productId}/verify-variant`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({variantId:selected.vid,quantity:verificationQuantity}),signal:controller.signal});
        const data=await response.json() as Check;
        if(!active)return;setStatus(response.ok?data.status:data.status||'verification_failed');setCheck(response.ok?data:null);setCheckedSelection({productId,vid:selected.vid,quantity:verificationQuantity});setShipping(0);
      }catch{if(active){setStatus('verification_failed');setCheck(null);}}
    },200);
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[productId,selected,qty,verificationQuantity]);
  const quote=check?.status==='available'&&quoteMatchesSelection(checkedSelection,productId,variantId,verificationQuantity)?check:null;
  // ترتيب شركات الشحن حسب إجمالي الشحن (الأساسي + الإضافي) تصاعدياً — الأرخص أولاً وهو الافتراضي.
  const shipSorted=useMemo(()=>quote?[...quote.shippingOptions].sort((a,b)=>(a.priceMinor+a.additionalMinor)-(b.priceMinor+b.additionalMinor)):[],[quote]);
  const ship=shipSorted[shipping],total=ship?.totalMinor??null;
  // حدّ الكمية بالمخزون المتاح (ناقص ما في السلة) فلا يتجاوز الطلب المخزون الفعلي.
  const maxQty=quote?Math.max(1,quote.stockQuantity-alreadyInCart):99;
  useEffect(()=>{if(qty>maxQty)setQty(maxQty);},[maxQty,qty]);
  function add(){
    if(!quote||!ship||!selected||!ready)return;
    const previous=latest().find(item=>item.id===productId&&item.variantId===selected.vid)?.qty??0;
    const attributes=Object.fromEntries(options.slice(0,30).map(option=>[option.label.slice(0,80),option.value.slice(0,160)]));
    const snapshot:TrialCartSnapshot={pid:productPid,vid:selected.vid,sku:quote.sku,productName,rawVariantName:selected.variantName||'',optionKey:selected.variantKey||'',displayLabel:labelFor(selected,selectedIndex).slice(0,500),attributes,verifiedQuantity:verificationQuantity,unitMinor:quote.salePriceMinor,stockQuantity:quote.stockQuantity,shippingName:ship.name,shippingMinor:ship.priceMinor,shippingAdditionalMinor:ship.additionalMinor,vatEnabled:ship.vatEnabled,vatMinor:ship.vatMinor,totalMinor:ship.totalMinor,deliveryDays:ship.deliveryDays,originCountry:ship.originCountry,checkedAt:quote.checkedAt};
    try{save(addTrialCartItem(latest(),{id:productId,qty,variantId:selected.vid,snapshot}),'أُضيف الخيار بعد التحقق إلى سلة التجربة.');setNotice('');setAdded(true);}catch{setNotice('تعذر الإضافة. تأكد من الكمية وحدود السلة.');}
  }
  return <section aria-label="خيارات الشراء التجريبي" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
    <h2 className="text-[15px] font-extrabold text-primary">خيارات الشراء</h2>
    {families.length>1&&<label className="block text-sm font-bold">نوع الخيار<select value={familyKey} onChange={e=>{setFamilyKey(e.target.value);setChosen({});}} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">اختر نوع الخيارات</option>{families.map(f=><option key={f.key} value={f.key}>{f.title}</option>)}</select></label>}
    {selected&&<p className="break-all rounded-lg bg-slate-50 p-2 text-xs">رمز الخيار المختار (SKU): <b dir="ltr">{selected.variantSku}</b></p>}
    {selector
      ? <div className="grid grid-cols-2 gap-2">{selector.groups.map(group=><div key={group.label} className="min-w-0">
          <label htmlFor={`${id}-${group.label}`} className="mb-1 block text-[13px] font-bold text-slate-700">{group.label}</label>
          <select id={`${id}-${group.label}`} value={chosen[group.label]||''} onChange={e=>setChosen(c=>Object.fromEntries(selector.groupLabels.slice(0,selector.groupLabels.indexOf(group.label)+1).map(l=>[l,l===group.label?e.target.value:c[l]||''])))} className="min-h-11 md:min-h-9 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">اختر {group.label}</option>{cjVariantValues(selector,group.label,chosen).map(val=><option key={val} value={val}>{group.label==='المقاس'?cjSizeOptionLabel(val,sizeChart):group.label==='المجموعة'?`مجموعة المورد ${val} — راجع محتوياتها قبل الشراء`:group.label==='عدد القطع في العبوة'?`${val} قطع في العبوة`:val}</option>)}</select>
        </div>)}
      </div>
      : family&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">بيانات خيارات المورد غير مكتملة أو ملتبسة؛ أُوقف اختيارها حتى تتضح مواصفاتها. لم يُحجز مخزون ولم يبدأ دفع.</p>}
    {selected&&<div className="grid grid-cols-2 gap-1.5 text-[13px]">{options.map((option,index)=><div key={`${option.label}-${index}`} className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5"><span className="block text-[11px] leading-tight text-slate-500" dir="auto">{option.label}</span><b className="break-words leading-tight" dir="auto">{option.value}</b></div>)}{selected.variantWeight!=null&&<div className="rounded-lg bg-slate-50 px-2 py-1.5"><span className="block text-[11px] leading-tight text-slate-500">الوزن</span><b className="leading-tight">{selected.variantWeight} غ</b></div>}</div>}
    {selected&&options.some(o=>o.label==='المجموعة')&&<p className="text-xs text-amber-800">رقم المجموعة تسمية لدى المورد، وليس عدد القطع. تفاصيل محتوياتها غير موضحة نصيًا؛ لا تعتمدها قبل التأكد من محتوياتها.</p>}
    <p role="status" aria-live="polite" className={`text-sm font-bold ${quote?'text-emerald-700':'text-amber-800'}`}>{!selected?'أكمل خيارات السلعة لبدء التحقق من السعر والمخزون والشحن.':quote?`${quote.priceChanged?'تم تحديث السعر · ':''}متوفر · الكمية المتاحة: ${quote.stockQuantity}`:!status||status==='checking'?'جارٍ التحقق من الخيار المختار…':failureMessage[status]||'تعذّر التحقق من الخيار؛ أعد اختياره للمحاولة مرة أخرى.'}</p>
    {quote&&<div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
      {/* يُعرض سعر المنتج النهائي فقط (شامل ربح تربح) — بلا أي ذكر للتكلفة أو المورّد أو المستودع. */}
      <p className="text-slate-700">سعر المنتج: <b className="text-lg text-emerald-800" dir="ltr">{money(quote.salePriceMinor)}</b></p>
      <p className="text-xs text-slate-600">{quote.destinationZip?`الشحن إلى الرمز البريدي ${quote.destinationZip}`:null}</p>
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
                  <span className="block text-[11px] text-slate-500"><b dir="ltr">{shipMinor===0?'مجاني':money(shipMinor)}</b>{days?` · ${days}`:''}</span>
                </span>
              </label>
            </li>
          );})}
        </ul>
      </div>
      {/* تفصيل شفّاف للإجمالي حتى يتّضح سبب الرقم: السلع (السعر×الكمية) + الشحن + الرسوم + الضريبة. */}
      <div className="space-y-1 rounded-lg bg-white/70 p-2">
        <p className="flex justify-between"><span>السلع (السعر × {verificationQuantity})</span><b dir="ltr">{money(quote.salePriceMinor*verificationQuantity)}</b></p>
        <p className="flex justify-between"><span>الشحن</span><b dir="ltr">{ship?(ship.priceMinor+ship.additionalMinor===0?'مجاني':money(ship.priceMinor+ship.additionalMinor)):'—'}</b></p>
        {ship?.vatEnabled&&<p className="flex justify-between"><span>ضريبة القيمة المضافة</span><b dir="ltr">{money(ship.vatMinor)}</b></p>}
        {ship?.deliveryDays&&<p className="flex justify-between"><span>مدّة الشحن</span><b dir="auto">{/[A-Za-z؀-ۿ]/.test(ship.deliveryDays)?ship.deliveryDays:`${ship.deliveryDays} يوم`}</b></p>}
        <p className="flex justify-between border-t border-emerald-200 pt-1.5 text-base"><span className="font-bold">الإجمالي</span><b className="text-xl text-emerald-800" dir="ltr">{total==null?'—':money(total)}</b></p>
      </div>
      <p className="text-xs text-slate-600">محسوب لكمية {verificationQuantity}، ويُعاد التحقق قبل الدفع. الإجمالي = السلع + الشحن{ship?.vatEnabled?' + الضريبة':''}.</p>
    </div>}
    <div className="flex flex-wrap items-end gap-2"><label htmlFor={`${id}-qty`} className="text-sm font-bold">الكمية{quote&&<span className="ms-1 text-xs font-normal text-slate-500">(المتاح: {maxQty})</span>}<input id={`${id}-qty`} type="number" min={1} max={maxQty} value={qty} onChange={event=>setQty(Math.max(1,Math.min(maxQty,Number(event.target.value)||1)))} className="mt-1 block min-h-11 w-24 rounded-lg border px-3" /></label><button type="button" disabled={!ready||!quote||!ship||!isStaff} onClick={add} className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{!isStaff?'للإدارة فقط':!selected?'أكمل خيارات الشراء':quote&&ship?'أضف إلى السلة':status==='out_of_stock'?'نفد مخزون الخيار':status==='checking'||!status?'جارٍ التحقق…':'راجع رسالة التحقق'}</button><CartLink accountId={accountId}/></div>
    {notice&&<p role="alert" className="text-sm text-red-700">{notice}</p>}
    {added&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3"><span className="text-sm font-bold text-emerald-800">✓ أُضيف إلى السلة</span><Link href="/cj/cart" className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white">اذهب إلى السلة والدفع ←</Link></div>}
    <p className="text-xs leading-6 text-slate-600">شراء خاص بالإدارة: أضِف الخيار المتحقّق إلى السلة، ثم من السلة يُنشأ الطلب ويُعتمد ويُدفع من المحفظة ويُتابع حتى التسليم.</p>
  </section>;
}
