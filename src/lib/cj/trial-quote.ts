import 'server-only';
import {getStorefrontCjProduct, parseCjAvailability, parseCjDetails} from './mapping';
import {cjImg,cjProductImages} from './storefront';
import {computePrice} from './pricing';
import {cjSyncSettings} from './sync';
import {checkedMoney,lineTotal} from '@/lib/commerce/money';
import {validateTrialCart,trialCartTotal,type TrialCartQuote} from './trial-cart';

function safeImage(value:unknown):string|null{
  if(typeof value!=='string'||value.length>2048)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?cjImg(url.href):null;}catch{return null;}
}
/** Saved CJ parent products only. No supplier requests, writes, orders, or payment quote. */
export async function quoteCjTrialCart(value:unknown):Promise<TrialCartQuote>{
  const items=validateTrialCart(value);
  const result:TrialCartQuote={currency:'SAR',lines:[],totalMinor:0,rejected:[]};
  let syncSettings:Awaited<ReturnType<typeof cjSyncSettings>>|null=null;
  for(const item of items){
    // Staff can preview drafts; the saved-row reader always excludes hidden rows.
    const row=await getStorefrontCjProduct(item.id,false);
    if(!row||Number(row.id)!==item.id||row.hidden!==0){result.rejected.push({id:item.id,reason:'unavailable'});continue;}
    const details=parseCjDetails(row),options=details?.variants??[];
    if(options.length&&!item.variantId){result.rejected.push({id:item.id,reason:'variant_required'});continue;}
    const selected=item.variantId?options.find(variant=>variant.vid===item.variantId):undefined;
    if(item.variantId&&!selected){result.rejected.push({id:item.id,variantId:item.variantId,reason:'variant_unavailable'});continue;}
    const availability=parseCjAvailability(row);
    const verified=selected?availability?.variants?.find(variant=>variant.vid===selected.vid):undefined;
    if(selected&&(!verified||item.qty>verified.stockQuantity)){result.rejected.push({id:item.id,variantId:item.variantId,reason:'variant_unavailable'});continue;}
    let unitMinor=row.sale_price_override_minor??row.sale_price_minor;
    if(selected?.priceUsd!=null&&Number.isFinite(selected.priceUsd)&&selected.priceUsd>0&&row.sale_price_override_minor==null){
      syncSettings??=await cjSyncSettings();
      unitMinor=computePrice(Math.round(selected.priceUsd*syncSettings.usdToSarX100),row.shipping_cost_minor,row.other_costs_minor,row.margin_bps).salePriceMinor;
    }
    let totalMinor:number;
    try{if(row.currency!=='SAR'||checkedMoney(unitMinor)===0)throw Error('invalid_money');totalMinor=lineTotal(unitMinor,item.qty);}catch{result.rejected.push({id:item.id,reason:'invalid_price'});continue;}
    result.lines.push({...item,title:(row.name_ar||'منتج بانتظار ترجمة الاسم').slice(0,400),variantName:selected?.optionKey||selected?.name||null,variantSku:selected?.sku||null,variantStock:verified?.stockQuantity??null,image:safeImage(cjProductImages(row)[0]),unitMinor,currency:'SAR',totalMinor});
  }
  try{result.totalMinor=trialCartTotal(result.lines);}catch{throw Error('invalid_total');}
  return result;
}
