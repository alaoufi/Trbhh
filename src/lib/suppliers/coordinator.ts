import {saudiCommercePhone} from '@/lib/commerce/config';
import type {SupplierOrderRequest} from './types';
import type {CommerceDb} from '@/lib/commerce/types';
import {randomUUID} from 'node:crypto';

export function normalizeStoreCoordinatorPhone(value:string):string {
  if(!value.trim())return '';
  const phone=saudiCommercePhone(value);
  if(!phone)throw new Error('supplier_coordinator_phone');
  return `+${phone}`;
}

type CoordinatorMessageInput={
  trbhhOrderId:string;
  sallaOrderId:string;
  sallaOrderUrl:string;
  shipping:SupplierOrderRequest['shipping'];
  items:SupplierOrderRequest['items'];
  shippingNotes?:string;
};

function safeOrderUrl(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('supplier_coordinator_order_url');}
  if(url.protocol!=='https:'||url.hostname!=='s.salla.sa'||!url.pathname.startsWith('/orders/order/')||url.username||url.password||url.port)throw new Error('supplier_coordinator_order_url');
  return url.href;
}

/** Builds only the operational minimum. It must be materialized by a delivery
 * worker after a paid receipt and a submitted Salla order; it is never stored
 * as the notification outbox payload. */
export function buildCoordinatorOrderMessage(input:CoordinatorMessageInput):string {
  if(!/^[1-9]\d*$/.test(input.trbhhOrderId)||!/^[1-9]\d*$/.test(input.sallaOrderId))throw new Error('supplier_coordinator_order_id');
  const items=input.items.map(item=>{
    const title=(item.name||item.sku||`منتج ${item.externalId}`).trim();
    return `- ${title} × ${item.quantity}${item.variantName?` — ${item.variantName}`:''}`;
  }).join('\n');
  const address=[input.shipping.city,input.shipping.addressLine,input.shipping.postalCode].filter(Boolean).join('، ');
  return [
    `طلب جديد للتجهيز — طلب تربح #${input.trbhhOrderId}`,
    `طلب سلة #${input.sallaOrderId}`,
    `العميل: ${input.shipping.name}`,
    `جوال التوصيل: ${input.shipping.phone}`,
    `العنوان: ${address}`,
    'المنتجات:',items,
    input.shippingNotes?`ملاحظات الشحن: ${input.shippingNotes}`:'',
    `مرجع الطلب: ${safeOrderUrl(input.sallaOrderUrl)}`,
  ].filter(Boolean).join('\n');
}

export type CoordinatorNotificationChannel='sms'|'whatsapp';
export interface CoordinatorNotifier {
  readonly channel:CoordinatorNotificationChannel;
  send(input:{recipient:string;message:string;deduplicationKey:string}):Promise<{providerMessageId:string}>;
}

type NotificationRow={
  id:bigint;supplier_order_id:bigint;order_id:bigint;external_order_id:string;external_order_url:string;
  recipient:string;request_snapshot:SupplierOrderRequest|string;attempts?:number;
};

function notificationSnapshot(value:SupplierOrderRequest|string):SupplierOrderRequest{
  let parsed:unknown=value;
  try{if(typeof value==='string')parsed=JSON.parse(value);}catch{throw new Error('supplier_coordinator_snapshot');}
  if(!parsed||typeof parsed!=='object'||!Array.isArray((parsed as SupplierOrderRequest).items)||!(parsed as SupplierOrderRequest).shipping)throw new Error('supplier_coordinator_snapshot');
  return parsed as SupplierOrderRequest;
}

/** Claims and sends only notifications backed by a paid receipt and a submitted
 * Salla order. Personal delivery data is materialized from the immutable order
 * snapshot only after the durable claim; it is never copied into the outbox. */
export async function deliverCoordinatorNotifications(db:CommerceDb,notifier:CoordinatorNotifier,limit=10):Promise<number>{
  if(!['sms','whatsapp'].includes(notifier.channel)||!Number.isInteger(limit)||limit<1||limit>20)throw new Error('supplier_coordinator_delivery_input');
  let delivered=0;
  for(let index=0;index<limit;index++){
    const claim=randomUUID();
    const row=await db.$transaction(async tx=>{
      const [candidate]=await tx.$queryRaw<NotificationRow[]>`SELECT n.id,n.supplier_order_id,so.order_id,so.external_order_id,so.external_order_url,n.recipient,so.request_snapshot,n.attempts FROM supplier_coordinator_notifications n JOIN supplier_orders so ON so.id=n.supplier_order_id JOIN commerce_orders o ON o.id=so.order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE n.status='pending' AND n.channel=${notifier.channel} AND n.event='order_submitted' AND so.status='submitted' AND so.payment_status='paid' AND so.external_order_id IS NOT NULL AND so.external_order_url<>'' AND o.status='paid' ORDER BY n.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if(!candidate)return null;
      const changed=await tx.$executeRaw`UPDATE supplier_coordinator_notifications SET status='sending',claim_token=${claim},claimed_at=UTC_TIMESTAMP(3),attempts=attempts+1,last_error='' WHERE id=${candidate.id} AND status='pending'`;
      return changed===1?candidate:null;
    });
    if(!row)break;
    try{
      const snapshot=notificationSnapshot(row.request_snapshot);
      const message=buildCoordinatorOrderMessage({trbhhOrderId:String(row.order_id),sallaOrderId:row.external_order_id,sallaOrderUrl:row.external_order_url,shipping:snapshot.shipping,items:snapshot.items,shippingNotes:snapshot.shippingNotes});
      const result=await notifier.send({recipient:row.recipient,message,deduplicationKey:`trbhh:supplier-order:${row.supplier_order_id}:order_submitted`});
      if(!result.providerMessageId||result.providerMessageId.length>191)throw new Error('supplier_coordinator_provider_reference');
      const changed=await db.$transaction(tx=>tx.$executeRaw`UPDATE supplier_coordinator_notifications SET status='sent',provider_message_id=${result.providerMessageId},claim_token=NULL,claimed_at=NULL,last_error='',sent_at=UTC_TIMESTAMP(3) WHERE id=${row.id} AND status='sending' AND claim_token=${claim}`);
      if(changed!==1)throw new Error('supplier_coordinator_claim_lost');
      delivered++;
    }catch(error){
      const code=(error instanceof Error?error.message:'supplier_coordinator_send_failed').slice(0,80);
      await db.$transaction(tx=>tx.$executeRaw`UPDATE supplier_coordinator_notifications SET status=IF(attempts>=5,'failed','pending'),claim_token=NULL,claimed_at=NULL,last_error=${code} WHERE id=${row.id} AND status='sending' AND claim_token=${claim}`);
    }
  }
  return delivered;
}
