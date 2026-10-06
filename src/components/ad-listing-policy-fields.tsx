'use client';
import {useInterfaceTexts} from './interface-texts';
import {PRICING_LABELS,pricingRequiresAmount,type ListingPolicy,type ListingTypeKey,type PricingModeKey} from '@/lib/ad-categories/listing-policy';

const field='h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';
export function AdListingPolicyFields({policy,listingType,pricingMode,onListingType,onPricingMode,initialPrice,priceEnabled=true}:{
  policy:ListingPolicy;listingType:ListingTypeKey;pricingMode:PricingModeKey;
  onListingType:(value:ListingTypeKey)=>void;onPricingMode:(value:PricingModeKey)=>void;initialPrice?:number;priceEnabled?:boolean;
}){
  const texts=useInterfaceTexts();
  const type=policy.types.find(item=>item.key===listingType)??policy.types[0];
  const mode=type.pricing.includes(pricingMode)?pricingMode:type.pricing[0];
  const requiresPrice=pricingRequiresAmount(mode),optionalBudget=mode==='budget_optional'||mode==='salary_optional';
  return <div className="space-y-3 rounded-xl border border-primary/20 p-3">
    <input type="hidden" name="listingType" value={type.key}/><input type="hidden" name="pricingMode" value={mode}/>
    <div><span className="mb-1 block text-sm font-bold">{texts.listingType}</span><div className="grid gap-2 sm:grid-cols-2">
      {policy.types.map(item=><button type="button" key={item.key} onClick={()=>{onListingType(item.key);onPricingMode(item.pricing[0]);}}
        className={`rounded-lg border-2 px-3 py-2.5 text-sm font-bold ${item.key===type.key?'border-primary bg-primary text-white':'border-primary/25 bg-white'}`}>{item.label}</button>)}
    </div></div>
    {priceEnabled&&<div><span className="mb-1 block text-sm font-bold">{texts.pricingMethod}</span><div className="flex flex-wrap gap-2">
      {type.pricing.map(item=><button type="button" key={item} onClick={()=>onPricingMode(item)}
        className={`rounded-lg border-2 px-3 py-2 text-sm font-bold ${item===mode?'border-amber-500 bg-amber-500 text-white':'border-amber-300 bg-white'}`}>{item==='bidding'?texts.bidding:PRICING_LABELS[item]}</button>)}
    </div></div>}
    {priceEnabled&&(requiresPrice||optionalBudget)&&<label className="block text-sm font-bold">{optionalBudget?'الميزانية المتوقعة (اختياري)':'السعر (ر.س)'}
      <input className={`${field} mt-1`} name="price" type="number" min="0" step="0.01" required={requiresPrice} defaultValue={initialPrice||''} placeholder={optionalBudget?'اتركه فارغًا إن لم تحدد ميزانية':'أدخل السعر لهذه الوحدة'}/>
    </label>}
    {priceEnabled&&mode==='bidding'&&<p className="rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-900">{texts.bidding}: {texts.biddingHint}</p>}
    {priceEnabled&&mode==='quote'&&<p className="rounded-lg bg-sky-50 p-3 text-xs font-bold text-sky-900">حسب الاتفاق: يحدد السعر بعد معرفة نطاق العمل أو مدة التأجير.</p>}
  </div>;
}
