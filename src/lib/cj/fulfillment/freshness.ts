import 'server-only';
import {validCjSourceOptions} from '../source-option-identity';
import {verifyCjSourceOptions} from '../verified-source-options';
import {getProduct,getVariants,getInventoryByVid,calculateFreightToKSA} from '../client';
import {exactUsdMinor} from './provider';
import type {Commitment} from './worker';
type Deps={product?:typeof getProduct;variants?:typeof getVariants;inventory?:typeof getInventoryByVid;freight?:typeof calculateFreightToKSA};
export type FreshSettlement={ok:true}|{ok:false;reason:string;actualUsdMinor?:number};
/** Re-read selected CJ variants and real stock, retaining the accepted route and
 * destination. This function never creates orders or initiates payment. */
export async function verifyCjCommitmentFresh(c:Commitment,deps:Deps={}):Promise<FreshSettlement>{
 try{
  if(c.destination.country!=='SA'||!/^\d{5}$/.test(c.destination.postalCode)||!c.lines.length||!Number.isSafeInteger(c.supplierFreightUsdMinor)||!Number.isSafeInteger(c.supplierTaxUsdMinor))return {ok:false,reason:'supplier_quote_incomplete'};
  if(c.lines.some(line=>!line.sku||!validCjSourceOptions(line.sourceOptions)))return {ok:false,reason:'supplier_options_unapproved'};
  let items=0;
  if(new Set(c.lines.map(l=>l.vid)).size!==c.lines.length)return {ok:false,reason:'supplier_quote_duplicate_variant'};
  for(const line of c.lines){
   if(!Number.isSafeInteger(line.quantity)||line.quantity<1||!Number.isSafeInteger(line.supplierUnitUsdMinor))return {ok:false,reason:'supplier_quote_incomplete'};
   const [variants,inventory]=await Promise.all([(deps.variants??getVariants)(line.pid),(deps.inventory??getInventoryByVid)(line.vid)]);
   if(!variants.ok||!inventory.ok)return {ok:false,reason:'supplier_recheck_unavailable'};
   const matches=variants.data.filter(v=>v.vid===line.vid);
   if(matches.length!==1)return {ok:false,reason:'supplier_options_changed'};
   const variant=matches[0],price=exactUsdMinor(variant.variantSellPrice);
   if(price===null||price!==line.supplierUnitUsdMinor)return {ok:false,reason:'supplier_price_changed'};
   const options=line.sourceOptions!;
   const verified=await verifyCjSourceOptions(line.pid,{vid:line.vid,variantSku:line.sku!,variantKey:options.key,variantName:options.name,optionSchema:options.schema,attributes:{options:options.attributes},variantSellPrice:null,variantWeight:null,variantImage:null},variant,deps.product??getProduct);
   if(!verified)return {ok:false,reason:'supplier_options_changed'};
   const stock=inventory.data.filter(w=>w.vid===line.vid&&w.areaId===c.originAreaId&&w.countryCode===c.originCountry).reduce((n,w)=>n+(Number.isSafeInteger(w.cjInventoryQuantity)&&w.cjInventoryQuantity!>0?w.cjInventoryQuantity!:0),0);
   if(stock<line.quantity)return {ok:false,reason:'supplier_stock_changed'};
   items+=price*line.quantity;if(!Number.isSafeInteger(items))return {ok:false,reason:'supplier_quote_incomplete'};
  }
  const result=await (deps.freight??calculateFreightToKSA)(c.lines.map(({vid,quantity})=>({vid,quantity})),c.destination.postalCode,c.originCountry);
  if(!result.ok)return {ok:false,reason:'supplier_recheck_unavailable'};
  const routes=result.data.filter(r=>r.logisticName.trim()===c.logisticName);
  if(routes.length!==1)return {ok:false,reason:'supplier_shipping_unavailable'};
  const route=routes[0],shipping=exactUsdMinor(route.logisticPrice),tax=route.totalPostageFeeUsd!=null?exactUsdMinor(route.totalPostageFeeUsd):exactUsdMinor((route.taxesFeeUsd??0)+(route.clearanceFeeUsd??0));
  if(shipping===null||tax===null)return {ok:false,reason:'supplier_shipping_unavailable'};
  const extras=route.totalPostageFeeUsd!=null?tax-shipping:tax,actualUsdMinor=items+shipping+extras;
  if(extras<0||shipping!==c.supplierFreightUsdMinor||extras!==c.supplierTaxUsdMinor||actualUsdMinor!==c.supplierUsdMinor)return {ok:false,reason:'supplier_shipping_changed',actualUsdMinor};
  return {ok:true};
 }catch{return {ok:false,reason:'supplier_recheck_unavailable'};}
}
