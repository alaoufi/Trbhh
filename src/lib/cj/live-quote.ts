import 'server-only';
import {createHash} from 'node:crypto';
import {checkedMoney,sumMoney} from '@/lib/commerce/money';
import {canonicalCjDestination} from './live-destination';
import {calculateFiscalLinesV2,effectiveFiscalVatBps} from '@/lib/finance/fiscal-v2';
import type {ApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';

export type CustomerFiscalSnapshot={policyId:string;requestId:string;productPriceBasis:'inclusive'|'exclusive';shippingPriceBasis:'inclusive'|'exclusive';productVatBps:number;shippingVatBps:number;productNetMinor:number;productVatMinor:number;productGrossMinor:number;shippingNetMinor:number;shippingVatMinor:number;shippingGrossMinor:number};

export type LiveCjQuote={version:1;checkedAt:string;expiresAt:string;destination:Record<string,string>;destinationHash:string;fulfillmentGroup:string;supplierReference:string;lines:{productId:string;pid:string;vid:string;quantity:number;supplierUnitUsdMinor:number;customerUnitSarMinor:number}[];originAreaId:string;originCountry:string;logisticName:string;supplierFreightUsdMinor:number;supplierTaxUsdMinor:number;supplierUsdMinor:number;usdToSarX100:number;marginBps:3000;customerShippingSarMinor:number;customerTaxSarMinor:number;customerSarMinor:number;customerFiscal:CustomerFiscalSnapshot};
export function destinationHash(destination:Record<string,string>):string{return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(destination).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');}
/** Read original supplier decimal USD. Never derive USD commitments from converted SAR. */
export function usdMinor(value:number):number{
 if(!Number.isFinite(value)||value<0||Math.abs(value*100-Math.round(value*100))>0.000001)throw new Error('cj_usd_precision');
 return checkedMoney(Math.round(value*100));
}
function validateCjCustomerFiscal(quote:LiveCjQuote):void{
 const f=quote.customerFiscal;
 if(!f||!/^[1-9]\d*$/.test(f.policyId)||!/^[1-9]\d*$/.test(f.requestId))throw new Error('cj_quote_fiscal_missing');
 const product=calculateFiscalLinesV2(quote.lines.map(line=>({key:line.productId,title:'منتج',component:'product' as const,quantity:line.quantity,unitPriceMinor:line.customerUnitSarMinor,discountMinor:0,vatBps:f.productVatBps,priceBasis:f.productPriceBasis})));
 const shipping=calculateFiscalLinesV2([{key:'shipping',title:'الشحن',component:'shipping',quantity:1,unitPriceMinor:quote.customerShippingSarMinor,discountMinor:0,vatBps:f.shippingVatBps,priceBasis:f.shippingPriceBasis}]);
 if(f.productNetMinor!==product.netMinor||f.productVatMinor!==product.vatMinor||f.productGrossMinor!==product.totalMinor||f.shippingNetMinor!==shipping.netMinor||f.shippingVatMinor!==shipping.vatMinor||f.shippingGrossMinor!==shipping.totalMinor||quote.customerTaxSarMinor!==sumMoney([product.vatMinor,shipping.vatMinor])||quote.customerSarMinor!==sumMoney([product.totalMinor,shipping.totalMinor]))throw new Error('cj_quote_fiscal_changed');
}
export function assertCjQuoteFiscalPolicy(quote:LiveCjQuote,policy:ApprovedFiscalPolicy):void{
 const f=quote.customerFiscal;
 if(!f||f.policyId!==policy.id||f.requestId!==policy.requestId||f.productPriceBasis!==policy.calculationPolicy.priceBasis||f.shippingPriceBasis!==policy.calculationPolicy.shippingPriceBasis||f.productVatBps!==effectiveFiscalVatBps(policy,'product')||f.shippingVatBps!==effectiveFiscalVatBps(policy,'shipping'))throw new Error('cj_quote_fiscal_policy_changed');
 validateCjCustomerFiscal(quote);
}
export function validateLiveCjQuote(quote:LiveCjQuote,destination:Record<string,string>,now:Date):LiveCjQuote{
 const canonical=canonicalCjDestination(quote.destination,{alreadyCanonical:true});
 if(Object.entries(canonical).some(([key,value])=>quote.destination[key]!==value))throw new Error('cj_quote_destination_invalid');
 if(typeof quote.supplierReference!=='string'||!/^[-A-Za-z0-9_]{1,50}$/.test(quote.supplierReference))throw new Error('cj_quote_reference_invalid');
 const checked=Date.parse(quote.checkedAt),expires=Date.parse(quote.expiresAt),clock=now.getTime();
 if(quote.version!==1||![checked,expires,clock].every(Number.isFinite)||checked>clock||expires<=clock||expires<=checked||expires-checked>300000)throw new Error('cj_quote_expired');
 if(quote.destinationHash!==destinationHash(destination)||quote.destinationHash!==destinationHash(quote.destination)||destination.country!=='SA'||!/^\d{5}$/.test(destination.postalCode||''))throw new Error('cj_quote_destination_changed');
 if(!quote.originAreaId||!quote.logisticName||!/^[A-Z]{2}$/.test(quote.originCountry)||!quote.fulfillmentGroup||!quote.supplierReference||quote.marginBps!==3000||!Number.isSafeInteger(quote.usdToSarX100)||quote.usdToSarX100<=0)throw new Error('cj_quote_identity_invalid');
 if(!Array.isArray(quote.lines)||!quote.lines.length||quote.lines.length>100)throw new Error('cj_quote_lines_invalid');
 const supplier:number[]=[];
 const unique=new Set<string>();
 for(const line of quote.lines){
  if(!/^[1-9]\d*$/.test(line.productId)||![line.pid,line.vid].every(v=>/^[A-Za-z0-9_-]{1,64}$/.test(v))||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>99||unique.has(line.productId))throw new Error('cj_quote_lines_invalid');
  unique.add(line.productId);checkedMoney(line.supplierUnitUsdMinor);checkedMoney(line.customerUnitSarMinor);
  if(!line.supplierUnitUsdMinor||!line.customerUnitSarMinor)throw new Error('cj_quote_price_invalid');
  supplier.push(checkedMoney(line.supplierUnitUsdMinor*line.quantity));
 }
 if(sumMoney([...supplier,quote.supplierFreightUsdMinor,quote.supplierTaxUsdMinor])!==quote.supplierUsdMinor)throw new Error('cj_quote_total_changed');
 validateCjCustomerFiscal(quote);
 return quote;
}
