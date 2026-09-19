import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import {digest,verifySignature} from './crypto';
export type SallaEvent={key:string;event:string;merchant:string;resourceId:string;occurredAt:string;kind:'product'|'order'|'ignore'};
const productEvents=new Set(['product.created','product.updated','product.deleted','product.available','product.quantity.low','product.price.updated','product.status.updated','product.image.updated','product.category.updated','product.brand.updated','product.tags.updated','product.channels.changed']);
const orderEvents=new Set(['order.created','order.updated','order.status.updated','order.cancelled','shipment.creating','shipment.created','shipment.updated','shipment.cancelled']);
const identifier=(value:unknown)=>{if((typeof value!=='string'&&!Number.isSafeInteger(value))||!/^\d{1,30}$/.test(String(value)))throw new Error('supplier_webhook_identity');return String(value);};
export function parseSallaEvent(raw:Buffer,signature:string,secret:string,now=new Date()):SallaEvent {
 if(raw.length>1048576)throw new Error('supplier_webhook_size');
 if(!verifySignature(raw,signature,secret))throw new Error('supplier_webhook_signature');
 let envelope;try{envelope=JSON.parse(raw.toString('utf8'));}catch{throw new Error('supplier_webhook_payload');}
 const event=String(envelope?.event||''),merchant=identifier(envelope?.merchant),created=String(envelope?.created_at||'');
 // Salla signs raw bytes without a separate timestamp header. Reject extreme age;
 // durable keys plus authoritative refetch protect repeated/reordered valid deliveries.
 const timestamp=Date.parse(created);if(!Number.isFinite(timestamp)||timestamp>now.getTime()+300000||timestamp<now.getTime()-7*86400000)throw new Error('supplier_webhook_timestamp');
 const kind=productEvents.has(event)?'product':orderEvents.has(event)?'order':'ignore';
 const resourceId=kind==='ignore'?'':identifier(event.startsWith('shipment.')?envelope.data?.order_id:event==='order.status.updated'?envelope.data?.order?.id:envelope.data?.id);
 const occurredAt=new Date(timestamp).toISOString();
 return {key:digest(JSON.stringify([merchant,event,resourceId,occurredAt,digest(raw)])),event,merchant,resourceId,occurredAt,kind};
}
export async function receiveSallaEvent(db:CommerceDb,event:SallaEvent):Promise<{accepted:boolean}> {
 if(event.kind==='ignore')return {accepted:false};
 return db.$transaction(async tx=>{
  const [connection]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_connections WHERE provider='salla' AND external_store_id=${event.merchant} AND status='connected'`;
  if(!connection)return {accepted:false};
  const payload=JSON.stringify({kind:event.kind,occurredAt:event.occurredAt});
  // Only resource metadata is persisted. Raw customer/token-bearing payload is discarded.
  await tx.$executeRaw`INSERT INTO supplier_webhook_events(connection_id,event_key,event_type,resource_id,payload) VALUES(${connection.id},${event.key},${event.event},${event.resourceId},${payload}) ON DUPLICATE KEY UPDATE id=id`;
  return {accepted:true};
 });
}
