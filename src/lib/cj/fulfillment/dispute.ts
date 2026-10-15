import 'server-only';
import {prisma} from '@/lib/prisma';
/** A customer objection is a fulfillment hold, never a refund or CJ cancellation. */
export async function raiseCjDeliveryDispute(orderId:bigint,memberId:bigint,reason:string){
 if(orderId<1n||memberId<1n||typeof reason!=='string'||reason.trim().length<10||reason.trim().length>1000)throw Error('dispute_invalid');
 return prisma.$transaction(async tx=>{
  const [order]=await tx.$queryRaw<{id:bigint}[]>`SELECT o.id FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE o.id=${orderId} AND o.member_id=${memberId} AND o.status='paid' AND o.currency='SAR' FOR UPDATE`;
  if(!order)throw Error('dispute_order_unavailable');
  const rows=await tx.$queryRaw<{id:bigint;evidence_json:unknown}[]>`SELECT id,evidence_json FROM commerce_cj_fulfillment_outbox WHERE commerce_order_id=${orderId} FOR UPDATE`;
  if(!rows.length)throw Error('dispute_order_unavailable');
  const existing=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_audit_events WHERE order_id=${orderId} AND event='cj_customer_dispute'`;
  if(existing.length)return;
  for(const row of rows){const meta=(typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json||{}) as Record<string,unknown>;await tx.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET evidence_json=${JSON.stringify({...meta,exception:{actionRequired:true,source:'customer',orderStatus:'CUSTOMER_DISPUTE',observedAt:new Date().toISOString()}})},version=version+1 WHERE id=${row.id}`;}
  await tx.$executeRaw`UPDATE commerce_orders SET fulfillment_status='action_required' WHERE id=${orderId}`;
  await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${orderId},'cj_customer_dispute',${JSON.stringify({source:'customer',memberId:String(memberId),reason:reason.trim(),financialAction:false})})`;
 });
}
