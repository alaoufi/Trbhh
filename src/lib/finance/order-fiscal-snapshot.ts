import 'server-only';
import type {Prisma} from '@prisma/client';
import type {ShippingSnapshot} from '@/lib/commerce/types';
import {checkedMoney} from '@/lib/commerce/money';
import type {CalculatedFiscalLineV2,FiscalLineV2,OrderFiscalSnapshot} from './types';
import {calculateFiscalLinesV2,validateCalculationPolicy,effectiveFiscalVatBps} from './fiscal-v2';
import {readApprovedFiscalPolicy,type ApprovedFiscalPolicy} from './fiscal-policy';
import {fingerprint} from './service';
import {financeJson} from './read-model';

export function quoteFiscalProduct(policy:ApprovedFiscalPolicy,item:{key:string;title:string;quantity:number;unitPriceMinor:number;discountMinor?:number}):CalculatedFiscalLineV2 {
 const calc=validateCalculationPolicy(policy.calculationPolicy);
 return calculateFiscalLinesV2([{...item,discountMinor:item.discountMinor??0,vatBps:effectiveFiscalVatBps(policy,'product'),priceBasis:calc.priceBasis,component:'product'}]).lines[0];
}
export function quoteFiscalShipping(policy:ApprovedFiscalPolicy,shippingFeeMinor:number):CalculatedFiscalLineV2 {
 const calc=validateCalculationPolicy(policy.calculationPolicy);
 return calculateFiscalLinesV2([{key:'shipping',title:'الشحن',quantity:1,unitPriceMinor:shippingFeeMinor,discountMinor:0,vatBps:effectiveFiscalVatBps(policy,'shipping'),priceBasis:calc.shippingPriceBasis,component:'shipping'}]).lines[0];
}
export function buildOrderFiscalSnapshot(orderId:bigint,at:Date,policy:ApprovedFiscalPolicy,shipping:ShippingSnapshot,lines:FiscalLineV2[]):OrderFiscalSnapshot {
 const calc=validateCalculationPolicy(policy.calculationPolicy);
 for(const line of lines){
  if(line.priceBasis!==(line.component==='shipping'?calc.shippingPriceBasis:calc.priceBasis)||line.vatBps!==effectiveFiscalVatBps(policy,line.component)||(calc.discountTreatment==='none'&&line.discountMinor!==0))throw new Error('finance_calculation_policy_mismatch');
 }
 const totals=calculateFiscalLinesV2(lines);
 checkedMoney(totals.totalMinor);for(const line of totals.lines)checkedMoney(line.grossMinor);
 if(lines.filter(x=>x.component==='shipping').length!==1)throw new Error('finance_shipping_snapshot_missing');
 return {version:2,orderId:String(orderId),capturedAt:at.toISOString(),policy,customer:{name:shipping.name,address:[shipping.addressLine,shipping.city,shipping.postalCode,shipping.country].join('، ')},currency:'SAR',...totals};
}
/** INSERT only: duplicate requests return their original order before reaching this function. */
export async function saveOrderFiscalSnapshot(tx:Prisma.TransactionClient,snapshot:OrderFiscalSnapshot){
 const hash=fingerprint(snapshot);
 await tx.$executeRaw`INSERT INTO finance_order_fiscal_snapshots(order_id,policy_id,request_id,captured_at,fingerprint,snapshot) VALUES(${BigInt(snapshot.orderId)},${BigInt(snapshot.policy.id)},${BigInt(snapshot.policy.requestId)},${new Date(snapshot.capturedAt)},${hash},${JSON.stringify(snapshot)})`;
 return hash;
}
export async function readOrderFiscalSnapshot(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,orderId:bigint):Promise<{snapshot:OrderFiscalSnapshot;fingerprint:string}> {
 const [row]=await tx.$queryRaw<{policy_id:bigint;request_id:bigint;captured_at:Date;fingerprint:string;snapshot:unknown}[]>`SELECT policy_id,request_id,captured_at,fingerprint,snapshot FROM finance_order_fiscal_snapshots WHERE order_id=${orderId}`;
 if(!row)throw new Error('finance_order_snapshot_missing');
 const snapshot=financeJson<OrderFiscalSnapshot>(row.snapshot);
 if(snapshot.version!==2||snapshot.orderId!==String(orderId)||snapshot.policy.id!==String(row.policy_id)||snapshot.policy.requestId!==String(row.request_id)||snapshot.capturedAt!==row.captured_at.toISOString()||fingerprint(snapshot)!==row.fingerprint)throw new Error('finance_order_snapshot_changed');
 const totals=calculateFiscalLinesV2(snapshot.lines);
 const policy=validateCalculationPolicy(snapshot.policy.calculationPolicy);
 if(snapshot.currency!=='SAR'||snapshot.lines.filter(line=>line.component==='shipping').length!==1||snapshot.lines.some(line=>line.priceBasis!==(line.component==='shipping'?policy.shippingPriceBasis:policy.priceBasis)||line.vatBps!==effectiveFiscalVatBps(snapshot.policy,line.component)||(policy.discountTreatment==='none'&&line.discountMinor!==0)))throw new Error('finance_calculation_policy_mismatch');
 checkedMoney(snapshot.totalMinor);
 if(fingerprint(totals)!==fingerprint({lines:snapshot.lines,netMinor:snapshot.netMinor,vatMinor:snapshot.vatMinor,totalMinor:snapshot.totalMinor}))throw new Error('finance_order_snapshot_changed');
 return {snapshot,fingerprint:row.fingerprint};
}
/** A changed policy requires review/requote before any new external payment attempt. */
export async function requireOrderFiscalPolicyAtPayment(tx:Prisma.TransactionClient,orderId:bigint,now:Date){
 const saved=await readOrderFiscalSnapshot(tx,orderId),active=await readApprovedFiscalPolicy(tx,now);
 if(fingerprint(saved.snapshot.policy)!==fingerprint(active))throw new Error('finance_policy_changed_before_payment');
 return saved;
}
