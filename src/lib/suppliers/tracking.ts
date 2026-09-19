import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierOrder} from './types';
import {digest} from './crypto';

function date(value:string|null):Date|null {
 if(value===null)return null;
 const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))throw new Error('supplier_tracking_invalid');return parsed;
}
function status(value:string):string {
 if(!/^[a-zA-Z0-9_-]{0,40}$/.test(value))throw new Error('supplier_tracking_invalid');return value;
}
/** Source facts only. Neither a provider GET nor webhook is bank/payment evidence. */
export async function recordSupplierTracking(db:CommerceDb,connectionId:bigint,source:SupplierOrder,observedAt:string|null=null):Promise<void>{
 if(!/^[1-9]\d{0,29}$/.test(source.externalId)||source.currency!=='SAR'||source.shipments.length>1000)throw new Error('supplier_tracking_invalid');
 const providerStatus=status(source.status),fallback=date(observedAt);
 await db.$transaction(async tx=>{
  const [order]=await tx.$queryRaw<{id:bigint;order_id:bigint;member_id:bigint;external_order_id:string;status:string}[]>`SELECT so.id,so.order_id,so.external_order_id,so.status,o.member_id FROM supplier_orders so JOIN commerce_orders o ON o.id=so.order_id JOIN supplier_connections c ON c.id=so.connection_id JOIN commerce_suppliers s ON s.id=so.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=s.id WHERE so.connection_id=${connectionId} AND so.external_order_id=${source.externalId} AND c.status='connected' AND s.active=1 AND p.maintenance=0 FOR UPDATE`;
  if(!order)return;
  // Preserve dispatch status and payment_status. Provider status is an audited observation.
  const observation=JSON.stringify({supplierOrderId:String(order.id),status:providerStatus,sourceUpdatedAt:source.sourceUpdatedAt});
  await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${order.order_id},${'ss:'+digest(observation).slice(0,32)},${observation}) ON DUPLICATE KEY UPDATE id=id`;
  await tx.$executeRaw`UPDATE supplier_orders SET updated_at=CURRENT_TIMESTAMP(3),last_error='' WHERE id=${order.id}`;
  for(const shipment of source.shipments){
   if(!shipment.externalId||shipment.externalId.length>191||shipment.carrier.length>120||shipment.trackingNumber.length>191)throw new Error('supplier_tracking_invalid');
   const shipmentStatus=status(shipment.status),fulfillmentStatus=status(shipment.fulfillmentStatus),sourceDate=date(shipment.sourceUpdatedAt)??fallback;
   const [old]=await tx.$queryRaw<{id:bigint;source_updated_at:Date|null}[]>`SELECT id,source_updated_at FROM supplier_shipments WHERE supplier_order_id=${order.id} AND external_id=${shipment.externalId} FOR UPDATE`;
   if(old?.source_updated_at&&(!sourceDate||sourceDate<=old.source_updated_at))continue;
   await tx.$executeRaw`INSERT INTO supplier_shipments(supplier_order_id,external_id,carrier,tracking_number,status,fulfillment_status,source_updated_at) VALUES(${order.id},${shipment.externalId},${shipment.carrier},${shipment.trackingNumber},${shipmentStatus},${fulfillmentStatus},${sourceDate}) ON DUPLICATE KEY UPDATE carrier=VALUES(carrier),tracking_number=VALUES(tracking_number),status=VALUES(status),fulfillment_status=VALUES(fulfillment_status),source_updated_at=VALUES(source_updated_at),updated_at=CURRENT_TIMESTAMP(3)`;
   const event='ship:'+digest(JSON.stringify([String(order.id),shipment.externalId,shipmentStatus,fulfillmentStatus])).slice(0,32);
   const payload=JSON.stringify({orderId:String(order.order_id),carrier:shipment.carrier,trackingNumber:shipment.trackingNumber,status:shipmentStatus,fulfillmentStatus});
   await tx.$executeRaw`INSERT INTO commerce_notifications(order_id,event,channel,recipient,payload) VALUES(${order.order_id},${event},'in_app',${'member:'+order.member_id},${payload}) ON DUPLICATE KEY UPDATE id=id`;
  }
 });
}

export type MemberTracking={id:string;carrier:string;trackingNumber:string;status:string;fulfillmentStatus:string};
/** Local inbox delivery is atomic with the outbox transition; no external transport. */
export async function deliverSupplierNotices(db:CommerceDb,limit=20):Promise<number>{
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('supplier_notice_limit');
 return db.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:bigint;order_id:bigint;member_id:bigint}[]>`SELECT n.id,n.order_id,o.member_id FROM commerce_notifications n JOIN commerce_orders o ON o.id=n.order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE n.event LIKE 'ship:%' AND n.channel='in_app' AND n.status='pending' AND n.recipient=CONCAT('member:',o.member_id) AND o.status='paid' ORDER BY n.id LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
  if(!rows.length)return 0;
  const [setting]=await tx.$queryRaw<{v:string|null}[]>`SELECT v FROM site_settings WHERE k='supplier_tracking_notice'`;
  const configured=setting?.v?.trim();
  const title=configured&&configured.length<=191&&!/[<>\u0000-\u001f]/.test(configured)?configured:'يوجد تحديث على شحن طلبك. راجع تفاصيل الطلب.';
  for(const row of rows){
   await tx.$executeRaw`INSERT INTO notfications(title,route,user_id,type,model_id,created_at,updated_at) VALUES(${title},${'/account/orders/'+row.order_id},${String(row.member_id)},'other',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
   const changed=await tx.$executeRaw`UPDATE commerce_notifications SET status='sent',sent_at=UTC_TIMESTAMP(3),last_error=NULL WHERE id=${row.id} AND status='pending'`;
   if(changed!==1)throw new Error('supplier_notice_claim_lost');
  }
  return rows.length;
 });
}
export async function memberOrderTracking(db:CommerceDb,orderId:bigint,memberId:bigint):Promise<MemberTracking[]>{
 if(orderId<=0n||memberId<=0n)throw new Error('supplier_tracking_invalid');
 const rows=await db.$queryRaw<{id:bigint;carrier:string;tracking_number:string;status:string;fulfillment_status:string}[]>`SELECT sh.id,sh.carrier,sh.tracking_number,sh.status,sh.fulfillment_status FROM supplier_shipments sh JOIN supplier_orders so ON so.id=sh.supplier_order_id JOIN commerce_orders o ON o.id=so.order_id WHERE o.id=${orderId} AND o.member_id=${memberId} ORDER BY sh.id LIMIT 100`;
 return rows.map(row=>({id:String(row.id),carrier:row.carrier,trackingNumber:row.tracking_number,status:row.status,fulfillmentStatus:row.fulfillment_status}));
}
