import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import {constantSecret} from '@/lib/suppliers/crypto';
import {requireFinancePermission} from '@/lib/access-control/financial-authorization';
import type {FinanceOrder,FiscalSnapshotV2} from './types';
import {assertFinanceSchemaReady} from './schema';
import {readApprovedFiscalPolicy} from './fiscal-policy';
import {readOrderFiscalSnapshot} from './order-fiscal-snapshot';
import {financeJson,financeNumber} from './read-model';
import {auditFinance,financeMonth,fingerprint,requireOpenPeriod} from './service';
import {sumFinanceMoney} from './calculations';

type Authority={actorId:bigint;mode:'manual'|'automation'};
const options={maxWait:10000,timeout:30000,isolationLevel:'ReadCommitted' as const};

/** Trusted server adapter: callers provide identity/receipt ID, never fiscal values. No provider I/O. */
export async function issueProspectiveInvoice(db:CommerceDb,receiptId:bigint,authority:Authority,now=new Date()):Promise<string>{
 if(receiptId<=0n||!['manual','automation'].includes(authority.mode)||!Number.isFinite(now.getTime()))throw new Error('finance_issuance_not_approved');
 await assertFinanceSchemaReady(db);
 return db.$transaction(async tx=>{
  await requireFinancePermission(tx,authority.actorId,'invoices:create');
  const [receipt]=await tx.$queryRaw<{id:bigint;order_id:bigint;amount_minor:bigint;currency:string;recorded_at:Date}[]>`SELECT id,order_id,amount_minor,currency,recorded_at FROM commerce_receipts WHERE id=${receiptId}`;
  if(!receipt||receipt.currency!=='SAR'||receipt.recorded_at>now)throw new Error('finance_invoice_difference');
  const saved=await readOrderFiscalSnapshot(tx,receipt.order_id);
  const policyAtOrder=await readApprovedFiscalPolicy(tx,new Date(saved.snapshot.capturedAt),{historicalSnapshot:true});
  const policyAtSale=await readApprovedFiscalPolicy(tx,receipt.recorded_at,{historicalSnapshot:true});
  if(fingerprint(policyAtOrder)!==fingerprint(saved.snapshot.policy)||fingerprint(policyAtSale)!==fingerprint(saved.snapshot.policy))throw new Error('finance_policy_changed_at_sale');
  if(authority.mode==='automation'&&String(authority.actorId)!==saved.snapshot.policy.calculationPolicy.automationDelegateId)throw new Error('finance_automation_delegate_mismatch');
  const [order]=await tx.$queryRaw<{id:bigint;member_id:bigint;status:string;currency:string;created_at:Date;paid_at:Date|null;subtotal_minor:number;shipping_fee_minor:number;total_minor:number;shipping:unknown}[]>`SELECT id,member_id,status,currency,created_at,paid_at,subtotal_minor,shipping_fee_minor,total_minor,shipping FROM commerce_orders WHERE id=${receipt.order_id}`;
  const amount=financeNumber(receipt.amount_minor);
  if(!order||order.status!=='paid'||order.currency!=='SAR'||order.total_minor!==amount||saved.snapshot.totalMinor!==amount||order.created_at.toISOString()!==saved.snapshot.capturedAt)throw new Error('finance_invoice_difference');
  const shipping=financeJson<{name:string;addressLine:string;city:string;postalCode:string;country:string}>(order.shipping);
  if(saved.snapshot.customer.name!==shipping.name||saved.snapshot.customer.address!==[shipping.addressLine,shipping.city,shipping.postalCode,shipping.country].join('، '))throw new Error('finance_invoice_identity_difference');
  const items=await tx.$queryRaw<{product_id:bigint;title:string;quantity:number;unit_price_minor:number;list_unit_price_minor:number|null;discount_minor:number;total_minor:number;variant_key:string;variant_snapshot:unknown}[]>`SELECT product_id,title,quantity,unit_price_minor,list_unit_price_minor,discount_minor,total_minor,variant_key,variant_snapshot FROM commerce_order_items WHERE order_id=${order.id} ORDER BY product_id`;
  const suppliers=await tx.$queryRaw<{supplier_id:bigint;supplier_name:string;product_id:bigint;total_cost_minor:number}[]>`SELECT supplier_id,supplier_name,product_id,total_cost_minor FROM commerce_order_suppliers WHERE order_id=${order.id} ORDER BY product_id`;
  const products=saved.snapshot.lines.filter(x=>x.component==='product'),shippingLine=saved.snapshot.lines.filter(x=>x.component==='shipping');
  if(products.length!==items.length||shippingLine.length!==1||shippingLine[0].grossMinor!==order.shipping_fee_minor||items.some(item=>!products.some(line=>line.key===String(item.product_id)&&line.title===item.title&&line.quantity===item.quantity&&line.unitPriceMinor===(item.list_unit_price_minor??item.unit_price_minor)&&line.discountMinor===item.discount_minor&&line.unitPriceMinor-line.discountMinor/item.quantity===item.unit_price_minor&&line.grossMinor===item.total_minor&&fingerprint(line.variantSnapshot??null)===fingerprint(item.variant_snapshot??null))))throw new Error('finance_invoice_difference');
  if(sumFinanceMoney(items.map(x=>x.total_minor))!==order.subtotal_minor||sumFinanceMoney([order.subtotal_minor,order.shipping_fee_minor])!==amount)throw new Error('finance_invoice_difference');
  for(const line of products){
   const supplier=suppliers.find(x=>String(x.product_id)===line.key);
   if(supplier?line.supplierId!==String(supplier.supplier_id)||line.supplierMinor!==supplier.total_cost_minor:line.supplierId!==undefined||line.supplierMinor!==undefined)throw new Error('finance_supplier_snapshot_difference');
  }
  const source:FinanceOrder={id:String(order.id),memberId:String(order.member_id),customerName:saved.snapshot.customer.name,status:order.status,createdAt:order.created_at.toISOString(),paidAt:order.paid_at?.toISOString()??null,subtotalMinor:order.subtotal_minor,shippingMinor:order.shipping_fee_minor,totalMinor:amount,currency:'SAR',items:items.map(x=>({productId:String(x.product_id),title:x.title,quantity:x.quantity,unitMinor:x.unit_price_minor,listUnitMinor:x.list_unit_price_minor,discountMinor:x.discount_minor,totalMinor:x.total_minor,variantSnapshot:(typeof x.variant_snapshot==='string'?JSON.parse(x.variant_snapshot):x.variant_snapshot) as FinanceOrder['items'][number]['variantSnapshot']})),suppliers:suppliers.map(x=>({supplierId:String(x.supplier_id),supplierName:x.supplier_name,productId:String(x.product_id),amountMinor:x.total_cost_minor}))};
  const snapshot:FiscalSnapshotV2={version:2,issuer:saved.snapshot.policy.issuer,customer:saved.snapshot.customer,currency:'SAR',lines:saved.snapshot.lines,netMinor:saved.snapshot.netMinor,vatMinor:saved.snapshot.vatMinor,totalMinor:amount,paidMinor:amount,sourceOrderId:String(order.id),sourceReceiptId:String(receiptId),policyReference:saved.snapshot.policy.policyReference,policyId:saved.snapshot.policy.id,policyRequestId:saved.snapshot.policy.requestId,orderSnapshotFingerprint:saved.fingerprint,derivation:'sale'};
  if(saved.snapshot.policy.calculationPolicy.vatControl)snapshot.vatControl={enabled:saved.snapshot.policy.calculationPolicy.vatControl.enabled};
  for(const month of [...new Set([financeMonth(receipt.recorded_at),financeMonth(now)])].sort())await requireOpenPeriod(tx,month);
  const sourceKey=`receipt:${receiptId}`;
  // The unique receipt key handles concurrent archive capture. Never replace a saved source.
  await tx.$executeRaw`INSERT INTO finance_invoices(order_id,receipt_id,source_key,created_at,total_minor,source_snapshot,reason) VALUES(${order.id},${receiptId},${sourceKey},${receipt.recorded_at},${amount},${JSON.stringify(source)},'بانتظار الإصدار من اللقطة المعتمدة') ON DUPLICATE KEY UPDATE id=id`;
  const [invoice]=await tx.$queryRaw<{id:bigint;status:string;number:string|null;snapshot:unknown;source_snapshot:unknown;total_minor:bigint;order_id:bigint;receipt_id:bigint;created_at:Date}[]>`SELECT id,status,number,snapshot,source_snapshot,total_minor,order_id,receipt_id,created_at FROM finance_invoices WHERE source_key=${sourceKey} FOR UPDATE`;
  if(!invoice||invoice.order_id!==order.id||invoice.receipt_id!==receiptId||financeNumber(invoice.total_minor)!==amount||invoice.created_at.getTime()!==receipt.recorded_at.getTime()||fingerprint(financeJson(invoice.source_snapshot))!==fingerprint(source))throw new Error('finance_invoice_difference');
  if(invoice.status==='issued'){
   if(fingerprint(financeJson(invoice.snapshot))!==fingerprint(snapshot)||!invoice.number)throw new Error('finance_invoice_immutable');
   return invoice.number;
  }
  if(invoice.status!=='pending_policy')throw new Error('finance_invoice_state');
  const series=`INV-${financeMonth(now).slice(0,4)}`;
  await tx.$executeRaw`INSERT INTO finance_sequences(name,next_value) VALUES(${series},1) ON DUPLICATE KEY UPDATE name=name`;
  const [sequence]=await tx.$queryRaw<{next_value:bigint}[]>`SELECT next_value FROM finance_sequences WHERE name=${series} FOR UPDATE`;
  const number=`${series}-${String(sequence.next_value).padStart(8,'0')}`;
  await tx.$executeRaw`UPDATE finance_sequences SET next_value=next_value+1 WHERE name=${series}`;
  await tx.$executeRaw`UPDATE finance_invoices SET status='issued',number=${number},issued_at=${now},net_minor=${snapshot.netMinor},vat_minor=${snapshot.vatMinor},snapshot=${JSON.stringify(snapshot)},reason='' WHERE id=${invoice.id} AND status='pending_policy'`;
  await auditFinance(tx,authority.actorId,'invoice_issued','invoice',String(invoice.id),'إصدار من لقطة الطلب المعتمدة والمقبوض الموثق',{before:{status:invoice.status},after:{status:'issued',number,snapshot},execution:authority.mode,delegatedByPolicyId:authority.mode==='automation'?saved.snapshot.policy.id:null,policyRequestId:saved.snapshot.policy.requestId,orderSnapshotFingerprint:saved.fingerprint},now);
  return number;
 },options);
}

export async function issueInvoicesForWorker(db:CommerceDb,authorization:string,now=new Date()):Promise<{issued:number;pending:number;failed:number}>{
 const secret=process.env.FINANCE_ISSUANCE_SECRET||'';
 if(secret.length<32||secret===process.env.FINANCE_CAPTURE_SECRET)throw new Error('finance_issuance_not_configured');
 if(typeof authorization!=='string'||authorization.length>1024||!authorization.startsWith('Bearer ')||!constantSecret(authorization.slice(7),secret))throw new Error('finance_issuance_unauthorized');
 await assertFinanceSchemaReady(db);
 const counts={issued:0,pending:0,failed:0};let cursor=0n;
 // Keyset pagination visits blocked receipts once per pass without starving later sales.
 while(true){
  const rows=await db.$queryRaw<{id:bigint;order_id:bigint;snapshot:unknown}[]>`
   SELECT r.id,r.order_id,s.snapshot FROM commerce_receipts r
   JOIN finance_order_fiscal_snapshots s ON s.order_id=r.order_id
   LEFT JOIN finance_invoices i ON i.source_key=CONCAT('receipt:',r.id)
   WHERE r.id>${cursor} AND (i.id IS NULL OR i.status='pending_policy') ORDER BY r.id LIMIT 100`;
  if(!rows.length)break;
  for(const row of rows){
   cursor=row.id;
   try{
    const order=financeJson<{policy:{calculationPolicy:{automationDelegateId:string}}}>(row.snapshot);
    const delegate=order.policy.calculationPolicy.automationDelegateId;
    if(!/^[1-9]\d{0,14}$/.test(delegate))throw new Error('finance_calculation_policy_invalid');
    await issueProspectiveInvoice(db,row.id,{actorId:BigInt(delegate),mode:'automation'},now);counts.issued++;
   }catch(error){
    const reason=error instanceof Error?error.message:'';
    if(['access_forbidden','finance_issuance_not_approved','finance_calculation_policy_invalid','finance_policy_changed_at_sale','finance_period_closed','finance_invoice_state'].includes(reason))counts.pending++;
    else counts.failed++;
   }
  }
 }
 return counts;
}
