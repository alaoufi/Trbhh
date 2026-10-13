import 'server-only';
import {prisma} from '@/lib/prisma';
export type ConfirmCjReceiptResult={ok:true;alreadyCompleted:boolean}|{ok:false;reason:'not_found_or_unpaid'|'delivery_unverified'};
/** Customer confirmation closes fulfillment only. Bank and supplier financial states are preserved. */
export async function confirmCjOrderReceipt(orderId:bigint,memberId:bigint):Promise<ConfirmCjReceiptResult> {
 if(orderId<=0n||memberId<=0n)return {ok:false,reason:'not_found_or_unpaid'};
 return prisma.$transaction(async tx=>{
  const [order]=await tx.$queryRaw<{id:bigint;fulfillment_status:string}[]>`SELECT o.id,o.fulfillment_status FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE o.id=${orderId} AND o.member_id=${memberId} AND o.status='paid' AND o.currency='SAR' AND NOT EXISTS (SELECT 1 FROM commerce_order_items i WHERE i.order_id=o.id AND NOT EXISTS (SELECT 1 FROM commerce_cj_order_quotes q WHERE q.commerce_order_id=o.id AND JSON_CONTAINS(q.quote_json,JSON_OBJECT('productId',CAST(i.product_id AS CHAR)),'$.lines'))) FOR UPDATE`;
  if(!order)return {ok:false,reason:'not_found_or_unpaid'};
  if(order.fulfillment_status==='completed')return {ok:true,alreadyCompleted:true};
  const groups=await tx.$queryRaw<{status:string|null;evidence_json:unknown}[]>`SELECT f.status,f.evidence_json FROM commerce_cj_order_quotes q LEFT JOIN commerce_cj_fulfillment_outbox f ON f.commerce_order_id=q.commerce_order_id AND f.fulfillment_group=q.fulfillment_group WHERE q.commerce_order_id=${orderId} FOR UPDATE`;
  const delivered=groups.length>0&&groups.every(group=>{try{const evidence=(typeof group.evidence_json==='string'?JSON.parse(group.evidence_json):group.evidence_json) as {fulfillment?:{stage?:string};exception?:{actionRequired?:boolean}};return group.status==='supplier_paid'&&evidence?.fulfillment?.stage==='delivered'&&!evidence.exception?.actionRequired;}catch{return false;}});
  if(!delivered)return {ok:false,reason:'delivery_unverified'};
  const changed=await tx.$executeRaw`UPDATE commerce_orders SET fulfillment_status='completed' WHERE id=${orderId} AND member_id=${memberId} AND status='paid' AND fulfillment_status<>'completed'`;
  if(changed!==1)throw Error('cj_receipt_confirmation_claim_lost');
  const payload=JSON.stringify({orderId:String(orderId),memberId:String(memberId),source:'customer_confirmation',allCjGroupsDelivered:true});
  await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${orderId},'cj_receipt_confirmed',${payload}) ON DUPLICATE KEY UPDATE id=id`;
  await tx.$executeRaw`INSERT INTO commerce_notifications(order_id,event,channel,recipient,payload) VALUES(${orderId},'ship:cj:receipt_confirmed','in_app',${'member:'+memberId},${payload}) ON DUPLICATE KEY UPDATE id=id`;
  return {ok:true,alreadyCompleted:false};
 });
}
