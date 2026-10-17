import {automaticCjPricing} from '@/lib/cj/automatic-pricing';
import 'server-only';
import {storedCjSourceOptions,sameCjSourceOptions} from './source-option-identity';
import {getStorefrontCjProduct,parseCjDetails} from './mapping';
import {cjImg,cjProductImages} from './storefront';
import {readVerifiedCjPricing} from './verified-pricing';
import {checkedMoney} from '@/lib/commerce/money';
import {validateTrialCart,trialCartTotal,type TrialCartQuote,type TrialCartItem} from './trial-cart';
import {verifyCjVariantForSaudi,type VariantCheck} from './availability';
import type {CjVariant} from './types';
import {quoteCjVat} from './tax-quote';

function safeImage(value:unknown):string|null{
  if(typeof value!=='string'||value.length>2048)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?cjImg(url.href):null;}catch{return null;}
}
type TrialRow=NonNullable<Awaited<ReturnType<typeof getStorefrontCjProduct>>>;
export type TrialQuoteDeps={destinationZip?:string;getProduct?:(id:number)=>Promise<TrialRow|null>;verify?:(row:TrialRow,variant:CjVariant,quantity:number)=>Promise<VariantCheck>;settings?:()=>Promise<{usdToSarX100:number;marginBps:number}>;quoteTax?:(unitMinor:number,quantity:number,shippingMinor:number)=>Promise<{enabled:boolean;vatMinor:number;totalMinor:number}>};

/** Cart refresh is a second live supplier check. No order, reserve, or payment endpoint is called. */
export async function quoteCjTrialCart(value:unknown,deps:TrialQuoteDeps={}):Promise<TrialCartQuote>{
  const items=validateTrialCart(value),result:TrialCartQuote={currency:'SAR',lines:[],totalMinor:0,rejected:[]};
  let settings:{usdToSarX100:number;marginBps:number}|null=null;
  for(const item of items){
    const row=await (deps.getProduct??((id:number)=>getStorefrontCjProduct(id,false)))(item.id);
    if(!row||Number(row.id)!==item.id||row.hidden!==0){result.rejected.push({id:item.id,reason:'unavailable'});continue;}
    const variants=parseCjDetails(row)?.variants??[];
    if(variants.length&&!item.variantId){result.rejected.push({id:item.id,reason:'variant_required'});continue;}
    if(!item.variantId||!item.snapshot){result.rejected.push({id:item.id,...(item.variantId?{variantId:item.variantId}:{}),reason:'verification_required'});continue;}
    const saved=variants.find(variant=>variant.vid===item.variantId);
    if(!saved){result.rejected.push({id:item.id,variantId:item.variantId,reason:'variant_unavailable'});continue;}
    if(item.snapshot.verifiedQuantity!==item.qty){result.rejected.push({id:item.id,variantId:item.variantId,reason:'verification_required'});continue;}
    settings??=await (deps.settings??readVerifiedCjPricing)();
    const providerVariant:CjVariant={vid:saved.vid,variantSku:saved.sku,variantName:saved.name,variantKey:saved.optionKey,variantSellPrice:saved.priceUsd,variantImage:null,variantWeight:saved.weight,attributes:saved.attributes,optionSchema:saved.optionSchema};
    const live=await (deps.verify??((product:TrialRow,variant:CjVariant,qty:number)=>verifyCjVariantForSaudi(product.cj_product_id,variant,qty,{},settings!.usdToSarX100,automaticCjPricing(settings!,product),deps.destinationZip)))(row,providerVariant,item.qty);
    if(live.status!=='available'){result.rejected.push({id:item.id,variantId:item.variantId,reason:live.status==='quantity_exceeds_stock'||live.status==='out_of_stock'?'stock_changed':'variant_unavailable'});continue;}
    const sourceOptions=storedCjSourceOptions(saved);
    if((live.optionKey??'').trim()!==sourceOptions?.key||(live.variantName??'').trim()!==sourceOptions?.name||!sameCjSourceOptions(sourceOptions,live.sourceOptions)||!sameCjSourceOptions(sourceOptions,item.snapshot.sourceOptions)||item.snapshot.pid!==row.cj_product_id||item.snapshot.sku!==saved.sku||item.snapshot.optionKey!==saved.optionKey||item.snapshot.rawVariantName!==saved.name){result.rejected.push({id:item.id,variantId:item.variantId,reason:'variant_unavailable'});continue;}
    if(live.stockQuantity!==item.snapshot.stockQuantity){result.rejected.push({id:item.id,variantId:item.variantId,reason:'stock_changed'});continue;}
    const shipping=live.shippingOptions.find(option=>option.name===item.snapshot!.shippingName&&option.originCountry===item.snapshot!.originCountry);
    if(!shipping||shipping.priceMinor!==item.snapshot.shippingMinor||shipping.additionalMinor!==item.snapshot.shippingAdditionalMinor||shipping.deliveryDays!==item.snapshot.deliveryDays){result.rejected.push({id:item.id,variantId:item.variantId,reason:'shipping_changed'});continue;}
    const tax=await (deps.quoteTax??quoteCjVat)(live.salePriceMinor,item.qty,shipping.priceMinor+shipping.additionalMinor);
    let totalMinor:number;
    try{checkedMoney(live.salePriceMinor);totalMinor=checkedMoney(tax.totalMinor);checkedMoney(tax.vatMinor);}catch{result.rejected.push({id:item.id,variantId:item.variantId,reason:'invalid_price'});continue;}
    const freshLine={...item,title:(item.snapshot.productName||row.name_ar||'بيانات المنتج قيد المراجعة').slice(0,400),variantName:saved.optionKey||saved.name||null,variantSku:saved.sku||null,variantStock:live.stockQuantity,image:safeImage(cjProductImages(row)[0]),unitMinor:live.salePriceMinor,shippingMinor:shipping.priceMinor,shippingAdditionalMinor:shipping.additionalMinor,vatMinor:tax.vatMinor,vatEnabled:tax.enabled,shippingName:shipping.name,deliveryDays:shipping.deliveryDays,currency:'SAR' as const,totalMinor};
    const priceChanged=live.salePriceMinor!==item.snapshot.unitMinor;
    const taxChanged=tax.enabled!==item.snapshot.vatEnabled||tax.vatMinor!==item.snapshot.vatMinor||tax.totalMinor!==item.snapshot.totalMinor;
    if(priceChanged||taxChanged){
      const replacement={...freshLine,snapshot:{...item.snapshot,unitMinor:live.salePriceMinor,vatEnabled:tax.enabled,vatMinor:tax.vatMinor,totalMinor,checkedAt:live.checkedAt}};
      validateTrialCart([{id:replacement.id,qty:replacement.qty,variantId:replacement.variantId,snapshot:replacement.snapshot}]);
      (result.updates??=[]).push(replacement);
      result.rejected.push({id:item.id,variantId:item.variantId,reason:priceChanged?'price_changed':'tax_changed'});continue;
    }
    result.lines.push(freshLine);
  }
  try{result.totalMinor=trialCartTotal(result.lines);}catch{throw Error('invalid_total');}
  return result;
}
