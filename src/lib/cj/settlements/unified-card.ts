import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {cjPrivateFinancialOperationsAllowed} from '../live-gates';
import {fulfillmentStore} from '../fulfillment/store';
import {makeFulfillmentProvider,prepareCjBatchParent} from '../fulfillment/provider';
import {matchesCommitment,type FulfillmentRecord,type PaymentProof} from '../fulfillment/worker';
import {verifyCjCommitmentFresh} from '../fulfillment/freshness';
import {settlementIds} from './policy';

type Member={id:string;orderId:bigint;cjOrderId:string;amount:number};
/** A persisted claim covers every member before the first cart mutation. Existing
 * individual payIds are never reparented: they may already be open in a browser. */
export async function prepareUnifiedCjSettlement(id:string){
 if(!await cjPrivateFinancialOperationsAllowed())throw Error('cj_fulfillment_disabled');
 const [batchId]=settlementIds([id]);
 const members=await prisma.$queryRaw<{outbox_id:bigint;commerce_order_id:bigint;cj_order_id:string;total_usd_minor:number}[]>`SELECT outbox_id,commerce_order_id,cj_order_id,total_usd_minor FROM commerce_cj_settlement_lines WHERE batch_id=${batchId} ORDER BY outbox_id`;
 settlementIds(members.map(m=>String(m.outbox_id)));
 const lines:Member[]=members.map(m=>({id:String(m.outbox_id),orderId:m.commerce_order_id,cjOrderId:m.cj_order_id,amount:m.total_usd_minor}));
 const rows:FulfillmentRecord[]=[];const codes:string[]=[];
 for(const line of lines){
  const row=await fulfillmentStore.read(line.id);
  if(!row?.customerPaidVerified||row.actionRequired||row.cjOrderId!==line.cjOrderId||row.commitment.supplierUsdMinor!==line.amount)throw Error('batch_member_invalid');
  rows.push(row);
 }
 // Repeated clicks return the same complete shared identity, without CJ writes.
 const existing=sharedBatchPayment(rows,id);
 if(existing)return existing;
 for(const row of rows){
  if(row.status!=='created'||row.payment||row.lastError)throw Error('batch_requires_unparented_orders');
  const provider=makeFulfillmentProvider(row.commitment),proof=await provider.detail(row.cjOrderId!);
  if(proof.orderId!==row.cjOrderId||!matchesCommitment(row.commitment,proof)||proof.paymentDate||proof.payableUsdMinor!==row.commitment.supplierUsdMinor||!proof.cjOrderCode||!['CREATED','IN_CART','UNPAID'].includes(proof.orderStatus||''))throw Error('batch_order_changed');
  const fresh=await verifyCjCommitmentFresh(row.commitment);if(!fresh.ok)throw Error(fresh.reason);
  codes.push(proof.cjOrderCode);
 }
 const total=lines.reduce((sum,l)=>sum+l.amount,0);
 if(!Number.isSafeInteger(total)||total<1||new Set(codes).size!==codes.length)throw Error('batch_amount_invalid');
 await prisma.$transaction(async tx=>{
  for(const orderId of [...new Set(lines.map(l=>String(l.orderId)))].map(BigInt).sort((a,b)=>a<b?-1:1))await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${orderId} FOR UPDATE`;
  const [batch]=await tx.$queryRaw<{total_usd_minor:number}[]>`SELECT total_usd_minor FROM commerce_cj_settlement_batches WHERE id=${batchId} FOR UPDATE`;
  if(batch?.total_usd_minor!==total)throw Error('batch_amount_changed');
  for(let i=0;i<lines.length;i++){
   const line=lines[i],row=rows[i];
   const [locked]=await tx.$queryRaw<{version:number;status:string;pay_id:string|null;verified:bigint;granted:bigint}[]>`SELECT f.version,f.status,f.pay_id,EXISTS(SELECT 1 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE o.id=f.commerce_order_id AND o.status='paid' AND o.currency='SAR') AS verified,EXISTS(SELECT 1 FROM commerce_cj_settlement_wallet_grants g WHERE g.outbox_id=f.id) AS granted FROM commerce_cj_fulfillment_outbox f JOIN commerce_cj_settlement_lines l ON l.outbox_id=f.id AND l.batch_id=${batchId} AND l.status='pending' AND l.cj_order_id=f.cj_order_id WHERE f.id=${BigInt(line.id)} FOR UPDATE`;
   if(!locked||locked.version!==row.version||locked.status!=='created'||locked.pay_id||Number(locked.verified)!==1||Number(locked.granted)!==0)throw Error('batch_claim_conflict');
   await tx.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET status='parent_claimed',version=version+1,evidence_json=${JSON.stringify({createAcknowledgement:row.createAcknowledgement,proof:{batchClaim:id}})},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${BigInt(line.id)} AND version=${row.version}`;
  }
 },{timeout:15000});
 let payment:Awaited<ReturnType<typeof prepareCjBatchParent>>;
 try{
  payment=await prepareCjBatchParent(codes);
  if(payment.payableUsdMinor!==total)throw Error('batch_payable_mismatch');
  await prisma.$transaction(async tx=>{
   for(const orderId of [...new Set(lines.map(l=>String(l.orderId)))].map(BigInt).sort((a,b)=>a<b?-1:1))await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${orderId} FOR UPDATE`;
   for(let i=0;i<lines.length;i++){
    const row=rows[i],line=lines[i];
    const perOrder:PaymentProof={...payment,payableUsdMinor:line.amount,batchId:id,batchPayableUsdMinor:total};
    const changed=await tx.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET status='payment_ready',version=version+1,shipment_order_id=${payment.shipmentOrderId},pay_id=${payment.payId},pay_expires_at=${new Date(payment.expiresAt)},evidence_json=${JSON.stringify({createAcknowledgement:row.createAcknowledgement,payment:perOrder,proof:{batchId:id,codes,totalUsdMinor:total}})},last_error=NULL,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${BigInt(line.id)} AND version=${row.version+1} AND status='parent_claimed'`;
    if(changed!==1)throw Error('batch_finalize_conflict');
   }
  },{timeout:15000});
 }catch{
  // The claim is intentionally retained after a timeout or process interruption.
  // Read reconciliation can still discover payment; no cart/parent is replayed.
  await prisma.$executeRaw(Prisma.sql`UPDATE commerce_cj_fulfillment_outbox SET status='parent_uncertain',last_error='batch_parent_outcome_unknown',version=version+1 WHERE id IN (${Prisma.join(lines.map(l=>BigInt(l.id)))}) AND status='parent_claimed'`);
  throw Error('batch_parent_requires_review');
 }
 return payment;
}
export function sharedBatchPayment(rows:FulfillmentRecord[],id:string):PaymentProof|null{
 const first=rows[0]?.payment,total=rows.reduce((sum,r)=>sum+r.commitment.supplierUsdMinor,0);
 if(!first||first.batchId!==id||first.batchPayableUsdMinor!==total||first.expiresAt<=Date.now())return null;
 return rows.every(r=>r.status==='payment_ready'&&!r.lastError&&r.payment?.batchId===id&&r.payment.payId===first.payId&&r.payment.shipmentOrderId===first.shipmentOrderId&&r.payment.expiresAt===first.expiresAt&&r.payment.payableUsdMinor===r.commitment.supplierUsdMinor&&r.payment.batchPayableUsdMinor===total)?{...first,payableUsdMinor:total}:null;
}
