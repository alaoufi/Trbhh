import 'server-only';
import {prisma} from '@/lib/prisma';
import type {FulfillmentRecord,FulfillmentStore} from './worker';
import {validateAndTransformLiveCjQuoteToCommitment} from './commitment';
type Row={id:bigint;version:number;status:FulfillmentRecord['status'];quote_json:unknown;supplier_reference:string;cj_order_id:string|null;evidence_json:unknown;last_error:string|null;paid_verified:bigint};
function json<T>(v:unknown):T {return (typeof v==='string'?JSON.parse(v):v) as T;}
function record(r:Row|undefined):FulfillmentRecord|null {
 if(!r)return null;const commitment=validateAndTransformLiveCjQuoteToCommitment(json<unknown>(r.quote_json));const meta=r.evidence_json?json<{payment?:FulfillmentRecord['payment'];proof?:unknown;createAcknowledgement?:FulfillmentRecord['createAcknowledgement']}>(r.evidence_json):{};
 if(commitment.supplierReference!==r.supplier_reference)throw Error('fulfillment_reference_corrupt');
 return {id:r.id.toString(),version:r.version,status:r.status,commitment,customerPaidVerified:Number(r.paid_verified)===1,cjOrderId:r.cj_order_id||undefined,createAcknowledgement:meta.createAcknowledgement,payment:meta.payment,evidence:meta.proof,lastError:r.last_error||undefined};
}
/** No in-memory locks: version CAS is the durable mutation claim across processes. */
export const fulfillmentStore:FulfillmentStore={
 async read(id){const rows=await prisma.$queryRaw<Row[]>`SELECT f.*, EXISTS(SELECT 1 FROM commerce_receipts r JOIN commerce_orders o ON o.id=r.order_id WHERE r.order_id=f.commerce_order_id AND r.amount_minor=o.total_minor AND r.currency='SAR') AS paid_verified FROM commerce_cj_fulfillment_outbox f WHERE f.id=${BigInt(id)}`;
  return record(rows[0]);
 },
 async cas(id,version,patch){return prisma.$transaction(async tx=>{
  const [pointer]=await tx.$queryRaw<{commerce_order_id:bigint}[]>`SELECT commerce_order_id FROM commerce_cj_fulfillment_outbox WHERE id=${BigInt(id)}`;
  if(!pointer)return false;
  // Lock the customer order before its outbox, matching payment/receipt writes.
  const [order]=await tx.$queryRaw<{id:bigint;member_id:bigint;status:string;currency:string;fulfillment_status:string}[]>`SELECT id,member_id,status,currency,fulfillment_status FROM commerce_orders WHERE id=${pointer.commerce_order_id} FOR UPDATE`;
  if(!order||order.status!=='paid'||order.currency!=='SAR')return false;
  const rows=await tx.$queryRaw<Row[]>`SELECT f.*, EXISTS(SELECT 1 FROM commerce_receipts r JOIN commerce_orders o ON o.id=r.order_id WHERE r.order_id=f.commerce_order_id AND r.amount_minor=o.total_minor AND r.currency='SAR') AS paid_verified FROM commerce_cj_fulfillment_outbox f WHERE f.id=${BigInt(id)} FOR UPDATE`;
  const current=record(rows[0]);if(!current||current.version!==version||!current.customerPaidVerified)return false;
  // Quote/customer receipt/reference cannot be changed through worker updates.
  const next={...current,...patch};const payment=next.payment;
  const changed=await tx.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET version=version+1,status=${next.status},cj_order_id=${next.cjOrderId||null},shipment_order_id=${payment?.shipmentOrderId||null},pay_id=${payment?.payId||null},pay_expires_at=${payment?new Date(payment.expiresAt):null},evidence_json=${JSON.stringify({payment,proof:next.evidence,createAcknowledgement:next.createAcknowledgement})},last_error=${next.lastError||null},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${BigInt(id)} AND version=${version}`;
  if(changed!==1)return false;
  if(['blocked','parent_uncertain'].includes(next.status)&&order.fulfillment_status!=='completed'){
   // A bank-paid hold must be visible even when no dispatcher can resume it.
   // This changes fulfillment only; it authorizes no refund or supplier retry.
   await tx.$executeRaw`UPDATE commerce_orders SET fulfillment_status='action_required' WHERE id=${order.id} AND status='paid' AND fulfillment_status<>'completed'`;
   const event=`ship:cj:hold:${current.id}`;
   const payload=JSON.stringify({orderId:String(order.id),fulfillmentId:current.id,fulfillmentStatus:'action_required',actionRequired:true,customerPaymentVerified:true,source:'cj',supplierStatus:next.status,reason:next.lastError||'supplier_fulfillment_held'});
   await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${order.id},${event},${payload}) ON DUPLICATE KEY UPDATE id=id`;
   await tx.$executeRaw`INSERT INTO commerce_notifications(order_id,event,channel,recipient,payload) VALUES(${order.id},${event},'in_app',${'member:'+order.member_id},${payload}) ON DUPLICATE KEY UPDATE id=id`;
  }
  return true;
 },{maxWait:10000,timeout:20000});
 },
};
