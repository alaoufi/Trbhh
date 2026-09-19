import {checkedMoney} from '@/lib/commerce/money';
import type {SupplierPricingPolicy} from './types';
export type SupplierPricingInput = {
  publicMinor:number;costMinor:number;policy:SupplierPricingPolicy;currency?:string;
  sellingMinor?:number;discountMinor?:number;discountBps?:number;
  minimumPriceMinor?:number;minimumMarginMinor?:number;
};
export type SupplierPricingResult = {publicMinor:number;costMinor:number;sellingMinor:number;profitMinor:number;currency:'SAR'};
/** Explicit admin application only: synchronizing source prices must not invoke
 * this implicitly or overwrite approved selling prices/negotiated costs. */
export function calculatePricing(input:SupplierPricingInput):SupplierPricingResult {
  if(!input || typeof input!=='object' || (input.currency!==undefined && input.currency!=='SAR'))throw new Error('invalid_supplier_currency');
  const publicMinor=checkedMoney(input.publicMinor),costMinor=checkedMoney(input.costMinor);
  const minimumPrice=checkedMoney(input.minimumPriceMinor===undefined?0:input.minimumPriceMinor),minimumMargin=checkedMoney(input.minimumMarginMinor===undefined?0:input.minimumMarginMinor);
  const discount=checkedMoney(input.discountMinor===undefined?0:input.discountMinor),bps=input.discountBps===undefined?0:input.discountBps;
  if(!Number.isInteger(bps)||bps<0||bps>10000)throw new Error('invalid_discount_bps');
  if(input.sellingMinor!==undefined)checkedMoney(input.sellingMinor);
  let sellingMinor:number;
  switch(input.policy){
    case 'manual':sellingMinor=checkedMoney(input.sellingMinor as number);break;
    case 'source':sellingMinor=publicMinor;break;
    case 'fixed_discount':sellingMinor=checkedMoney(publicMinor-discount);break;
    case 'percent_discount':
      // BigInt keeps ceiling exact even at the upper monetary bound.
      sellingMinor=Number((BigInt(publicMinor)*BigInt(10000-bps)+9999n)/10000n);break;
    default:throw new Error('invalid_pricing_policy');
  }
  checkedMoney(sellingMinor);
  if(sellingMinor===0 || sellingMinor<minimumPrice || sellingMinor-costMinor<minimumMargin)throw new Error('supplier_price_below_minimum');
  return {publicMinor,costMinor,sellingMinor,profitMinor:sellingMinor-costMinor,currency:'SAR'};
}
