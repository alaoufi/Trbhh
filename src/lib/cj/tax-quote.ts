import 'server-only';
import {prisma} from '@/lib/prisma';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {calculateFiscalLinesV2,effectiveFiscalVatBps} from '@/lib/finance/fiscal-v2';

/** Preview-only VAT from the current approved central finance policy; absence means VAT off. */
export async function quoteCjVat(productUnitMinor:number,quantity:number,shippingMinor:number):Promise<{enabled:boolean;vatMinor:number;totalMinor:number}>{
  const base=productUnitMinor*quantity+shippingMinor;
  if(!Number.isSafeInteger(base)||base<0)throw new Error('invalid_cj_quote');
  const policy=await readApprovedFiscalPolicy(prisma,new Date()).catch(()=>null);
  if(!policy)return {enabled:false,vatMinor:0,totalMinor:base};
  const calculation=policy.calculationPolicy;
  const itemRate=effectiveFiscalVatBps(policy,'product'),shippingRate=effectiveFiscalVatBps(policy,'shipping');
  const item=calculateFiscalLinesV2([{key:'product',title:'منتجات',component:'product',quantity,unitPriceMinor:productUnitMinor,discountMinor:0,vatBps:itemRate,priceBasis:calculation.priceBasis}]);
  const shipping=shippingMinor?calculateFiscalLinesV2([{key:'shipping',title:'الشحن',component:'shipping',quantity:1,unitPriceMinor:shippingMinor,discountMinor:0,vatBps:shippingRate,priceBasis:calculation.shippingPriceBasis}]):{vatMinor:0,totalMinor:0};
  return {enabled:itemRate>0||shippingRate>0,vatMinor:item.vatMinor+shipping.vatMinor,totalMinor:item.totalMinor+shipping.totalMinor};
}
