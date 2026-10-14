import 'server-only';
import {prisma} from '@/lib/prisma';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {calculateFiscalLinesV2,effectiveFiscalVatBps} from '@/lib/finance/fiscal-v2';
import type {CustomerFiscalSnapshot} from './live-quote';

/** Live bank quotes require an approved fiscal policy even when its VAT switch
 * is disabled. Component net/tax/gross and price basis are immutable evidence. */
export async function quoteCjFiscal(productUnitMinor:number,quantity:number,shippingMinor:number){
 const policy=await readApprovedFiscalPolicy(prisma,new Date());
 const productVatBps=effectiveFiscalVatBps(policy,'product'),shippingVatBps=effectiveFiscalVatBps(policy,'shipping');
 const productPriceBasis=policy.calculationPolicy.priceBasis,shippingPriceBasis=policy.calculationPolicy.shippingPriceBasis;
 const product=calculateFiscalLinesV2([{key:'product',title:'منتجات',component:'product',quantity,unitPriceMinor:productUnitMinor,discountMinor:0,vatBps:productVatBps,priceBasis:productPriceBasis}]);
 const shipping=calculateFiscalLinesV2([{key:'shipping',title:'الشحن',component:'shipping',quantity:1,unitPriceMinor:shippingMinor,discountMinor:0,vatBps:shippingVatBps,priceBasis:shippingPriceBasis}]);
 const customerFiscal:CustomerFiscalSnapshot={policyId:policy.id,requestId:policy.requestId,productPriceBasis,shippingPriceBasis,productVatBps,shippingVatBps,productNetMinor:product.netMinor,productVatMinor:product.vatMinor,productGrossMinor:product.totalMinor,shippingNetMinor:shipping.netMinor,shippingVatMinor:shipping.vatMinor,shippingGrossMinor:shipping.totalMinor};
 return {enabled:productVatBps>0||shippingVatBps>0,vatMinor:product.vatMinor+shipping.vatMinor,totalMinor:product.totalMinor+shipping.totalMinor,customerFiscal};
}

/** Preview-only VAT from the current approved central finance policy; absence means VAT off. */
export async function quoteCjVat(productUnitMinor:number,quantity:number,shippingMinor:number):Promise<{enabled:boolean;vatMinor:number;totalMinor:number}>{
  const base=productUnitMinor*quantity+shippingMinor;
  if(!Number.isSafeInteger(productUnitMinor)||productUnitMinor<0||!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(shippingMinor)||shippingMinor<0||!Number.isSafeInteger(base)||base<0)throw new Error('invalid_cj_quote');
  const policy=await readApprovedFiscalPolicy(prisma,new Date()).catch(error=>{
    if(error instanceof Error&&error.message==='finance_issuance_not_approved')return null;
    throw error;
  });
  if(!policy)return {enabled:false,vatMinor:0,totalMinor:base};
  const calculation=policy.calculationPolicy;
  const itemRate=effectiveFiscalVatBps(policy,'product'),shippingRate=effectiveFiscalVatBps(policy,'shipping');
  const item=calculateFiscalLinesV2([{key:'product',title:'منتجات',component:'product',quantity,unitPriceMinor:productUnitMinor,discountMinor:0,vatBps:itemRate,priceBasis:calculation.priceBasis}]);
  const shipping=shippingMinor?calculateFiscalLinesV2([{key:'shipping',title:'الشحن',component:'shipping',quantity:1,unitPriceMinor:shippingMinor,discountMinor:0,vatBps:shippingRate,priceBasis:calculation.shippingPriceBasis}]):{vatMinor:0,totalMinor:0};
  return {enabled:itemRate>0||shippingRate>0,vatMinor:item.vatMinor+shipping.vatMinor,totalMinor:item.totalMinor+shipping.totalMinor};
}
