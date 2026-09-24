import 'server-only';
import { calculateFreightToKSA, getInventoryByPid, getInventoryByVid, getVariants } from './client';
import type { CjFreightOption, CjInventory, CjResult, CjVariant } from './types';
import { computePrice } from './pricing';

export type AvailabilityDeps = {
  getInventoryByPid?: typeof getInventoryByPid;
  calculateFreight?: typeof calculateFreightToKSA;
  getInventoryByVid?: typeof getInventoryByVid;
  getVariants?: typeof getVariants;
};
export type VariantCheckStatus = 'available'|'out_of_stock'|'quantity_exceeds_stock'|'inventory_error'|'variant_changed'|'no_shipping'|'freight_error'|'invalid_price';
export type SaudiShippingOption = {name:string;priceMinor:number;additionalMinor:number;currency:'SAR';deliveryDays:string|null;originCountry:string};
export type VariantCheck =
  | {status:'available';vid:string;sku:string;variantName:string|null;optionKey:string|null;stockQuantity:number;priceChanged:boolean;warehouses:{id:string|null;name:string|null;quantity:number;originCountry:string}[];supplierPriceMinor:number;salePriceMinor:number;shippingOptions:SaudiShippingOption[];checkedAt:string}
  | {status:Exclude<VariantCheckStatus,'available'>;checkedAt:string};

const nowIso=()=>new Date().toISOString();
const safeQuantity=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:0;
const minorFromUsd=(usd:number,rate:number)=>Math.round(usd*rate);

/**
 * Verify one selected CJ VID for one requested quantity. No saved availability or
 * sibling variant can make this check pass. CJ errors are normalized before return.
 */
export async function verifyCjVariantForSaudi(pid:string,selected:CjVariant,quantity:number,deps:AvailabilityDeps={},usdToSarX100=375,pricing?:{otherCostsMinor?:number;marginBps?:number;saleOverrideMinor?:number|null}):Promise<VariantCheck>{
  const checkedAt=nowIso();
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(pid)||!/^[A-Za-z0-9_-]{1,64}$/.test(selected.vid)||!Number.isSafeInteger(quantity)||quantity<1||quantity>99||!Number.isSafeInteger(usdToSarX100)||usdToSarX100<1||usdToSarX100>100000)return {status:'invalid_price',checkedAt};
  const [inventoryResult,variantResult]=await Promise.all([
    (deps.getInventoryByVid??getInventoryByVid)(selected.vid).catch(()=>null),
    (deps.getVariants??getVariants)(pid).catch(()=>null),
  ]);
  if(!inventoryResult?.ok)return {status:'inventory_error',checkedAt};
  if(!variantResult?.ok)return {status:'variant_changed',checkedAt};
  const liveVariant=variantResult.data.find(variant=>variant.vid===selected.vid);
  if(!liveVariant)return {status:'variant_changed',checkedAt};
  // The queryByVid response includes factory and CJ quantities. Only CJ-managed
  // quantities can be treated as currently sellable; factory stock is unverified.
  const exactRows=inventoryResult.data.filter(row=>row.vid===selected.vid&&validOrigin(row.countryCode));
  const warehouses=exactRows.map(row=>({id:row.areaId,name:row.areaName,quantity:safeQuantity(row.cjInventoryQuantity),originCountry:row.countryCode!.toUpperCase()})).filter(row=>row.quantity>0);
  const stockQuantity=warehouses.reduce((sum,row)=>sum+row.quantity,0);
  if(!stockQuantity)return {status:'out_of_stock',checkedAt};
  if(quantity>stockQuantity)return {status:'quantity_exceeds_stock',checkedAt};
  const calculate=deps.calculateFreight??calculateFreightToKSA;
  const freightResults=await Promise.all([...new Set(warehouses.map(row=>row.originCountry))].map(async originCountry=>({originCountry,result:await calculate([{vid:selected.vid,quantity}],undefined,originCountry).catch(()=>null)})));
  const shippingOptions:SaudiShippingOption[]=[];
  let hadFreightFailure=false;
  for(const {originCountry,result} of freightResults){
    if(!result?.ok){hadFreightFailure=true;continue;}
    for(const option of result.data){
      if(!option.logisticName.trim()||!Number.isFinite(option.logisticPrice)||option.logisticPrice<0)continue;
      const listedExtra=(Number.isFinite(option.taxesFeeUsd)?option.taxesFeeUsd??0:0)+(Number.isFinite(option.clearanceFeeUsd)?option.clearanceFeeUsd??0:0);
      const totalExtra=Number.isFinite(option.totalPostageFeeUsd)&&option.totalPostageFeeUsd!>option.logisticPrice?option.totalPostageFeeUsd!-option.logisticPrice:listedExtra;
      shippingOptions.push({name:option.logisticName.trim().slice(0,80),priceMinor:minorFromUsd(option.logisticPrice,usdToSarX100),additionalMinor:minorFromUsd(totalExtra,usdToSarX100),currency:'SAR',deliveryDays:cleanAging(option.logisticAging),originCountry});
    }
  }
  if(!shippingOptions.length)return {status:hadFreightFailure?'freight_error':'no_shipping',checkedAt};
  shippingOptions.sort((a,b)=>a.priceMinor-b.priceMinor||a.name.localeCompare(b.name));
  const supplierPrice=liveVariant.variantSellPrice;
  if(typeof supplierPrice!=='number'||!Number.isFinite(supplierPrice)||supplierPrice<=0)return {status:'invalid_price',checkedAt};
  const supplierPriceMinor=minorFromUsd(supplierPrice,usdToSarX100);
  let salePriceMinor:number;
  if(pricing?.saleOverrideMinor!=null)salePriceMinor=pricing.saleOverrideMinor;
  else salePriceMinor=computePrice(supplierPriceMinor,0,pricing?.otherCostsMinor??0,pricing?.marginBps??3000).salePriceMinor;
  if(!Number.isSafeInteger(salePriceMinor)||salePriceMinor<=0)return {status:'invalid_price',checkedAt};
  return {status:'available',vid:liveVariant.vid,sku:liveVariant.variantSku,variantName:liveVariant.variantName??null,optionKey:liveVariant.variantKey??null,stockQuantity,priceChanged:typeof selected.variantSellPrice==='number'&&Number.isFinite(selected.variantSellPrice)&&selected.variantSellPrice!==liveVariant.variantSellPrice,warehouses,supplierPriceMinor,salePriceMinor,shippingOptions,checkedAt};
}

function validOrigin(value:string|null):boolean{return typeof value==='string'&&/^[A-Za-z]{2}$/.test(value.trim());}
function cleanAging(value:string|null):string|null{const clean=value?.trim();return clean&&clean.length<=40?clean:null;}

/** Import visibility proof; each variant is quoted independently so one unsupported
 * VID no longer invalidates every otherwise verified option in a 24-variant product. */
export async function readCjAvailability(pid:string,variants:CjVariant[],deps:AvailabilityDeps={}):Promise<string|null>{
  const eligible=variants.filter(variant=>/^[A-Za-z0-9_-]{1,64}$/.test(variant.vid));
  if(!eligible.length||eligible.length>100)return null;
  const inventory=await (deps.getInventoryByPid??getInventoryByPid)(pid).catch(()=>null);
  if(!inventory?.ok)return null;
  const variantByVid=new Map(eligible.map(variant=>[variant.vid,variant]));
  const quantityByVid=new Map<string,number>(),originByVid=new Map<string,string[]>();
  for(const row of inventory.data){
    const variant=variantByVid.get(row.vid),origin=row.countryCode?.trim().toUpperCase();
    if(!variant||!origin||!/^[A-Z]{2}$/.test(origin))continue;
    const quantity=safeQuantity(row.cjInventoryQuantity);
    if(!quantity)continue;
    quantityByVid.set(row.vid,(quantityByVid.get(row.vid)??0)+quantity);
    originByVid.set(row.vid,[...(originByVid.get(row.vid)??[]),origin]);
  }
  const calculate=deps.calculateFreight??calculateFreightToKSA;
  const verified:{vid:string;stockQuantity:number}[]=[],shippingOptions:SaudiShippingOption[]=[];
  for(const [vid,stockQuantity] of quantityByVid){
    for(const originCountry of new Set(originByVid.get(vid)??[])){
      const freight=await calculate([{vid,quantity:1}],undefined,originCountry).catch(()=>null);
      if(!freight?.ok)continue;
      const options=freight.data.filter((option:CjFreightOption)=>option.logisticName.trim()&&Number.isFinite(option.logisticPrice)&&option.logisticPrice>=0);
      if(!options.length)continue;
      if(!verified.some(item=>item.vid===vid))verified.push({vid,stockQuantity});
      shippingOptions.push(...options.map(option=>{const listedExtra=(option.taxesFeeUsd??0)+(option.clearanceFeeUsd??0),extra=option.totalPostageFeeUsd!=null&&option.totalPostageFeeUsd>option.logisticPrice?option.totalPostageFeeUsd-option.logisticPrice:listedExtra;return {name:option.logisticName.trim().slice(0,80),priceMinor:minorFromUsd(option.logisticPrice,375),additionalMinor:minorFromUsd(extra,375),currency:'SAR' as const,deliveryDays:cleanAging(option.logisticAging),originCountry};}));
    }
  }
  if(!verified.length||!shippingOptions.length)return null;
  return JSON.stringify({checkedAt:nowIso(),stockQuantity:verified.reduce((total,row)=>total+row.stockQuantity,0),variants:verified,shippingOptions});
}
