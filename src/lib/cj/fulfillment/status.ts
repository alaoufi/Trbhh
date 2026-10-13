import 'server-only';
import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {getCjOrderDetail,getTracking} from '../client';
import {fulfillmentStore} from './store';
import {makeFulfillmentProvider} from './provider';
import {matchesCommitment} from './worker';
export type SupplierStage='supplier_paid'|'preparing'|'shipped'|'delivered';
const ranks:Record<SupplierStage,number>={supplier_paid:0,preparing:1,shipped:2,delivered:3};
export function supplierStageFromProof(d:Record<string,unknown>):SupplierStage|null {
 const status=String(d.orderStatus||'').toUpperCase(),sub=String(d.subStatus||'').toUpperCase();
 if(status==='UNSHIPPED'&&sub==='PROCESSING'||status==='PROCESSING')return 'preparing';
 if(status==='SHIPPED'&&typeof d.trackNumber==='string'&&d.trackNumber.trim())return 'shipped';
 if(status==='DELIVERED')return 'delivered';
 return null;
}
export function safeTrackingUrl(value:unknown):string|null {
 if(typeof value!=='string'||value.length>1024)return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||/^\d+(\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':'))return null;return u.href;}catch{return null;}
}
type Meta={payment?:unknown;proof?:unknown;exception?:{actionRequired:boolean;source:'cj';orderStatus:string;observedAt:string};fulfillment?:{stage:SupplierStage;carrier:string;trackingNumber:string;lastTrackNumber?:string;trackingUrl:string|null;observedAt:string}};
function parseMeta(raw:unknown):Meta {return (typeof raw==='string'?JSON.parse(raw):raw||{}) as Meta;}
/** Read-only CJ reconciliation, with transactional customer-order status/notice persistence. */
export async function reconcileCjFulfillment(id:string):Promise<void> {
 const row=await fulfillmentStore.read(id);if(!row?.customerPaidVerified||row.status!=='supplier_paid'||!row.cjOrderId)return;
 const normalized=await makeFulfillmentProvider(row.commitment).detail(row.cjOrderId);
 if(normalized.orderId!==row.cjOrderId||!matchesCommitment(row.commitment,normalized))throw Error('cj_status_identity_mismatch');
 const detail=await getCjOrderDetail(row.cjOrderId);if(!detail.ok||!detail.data.proof)throw Error('cj_status_proof_unavailable');
 const raw=detail.data.proof;
 // The second read must preserve order identity as well, even during provider updates.
 if(String(raw.orderId)!==row.cjOrderId||String(raw.orderNum)!==row.commitment.supplierReference)throw Error('cj_status_identity_mismatch');
 const observed=supplierStageFromProof(raw);
 let carrier=typeof raw.logisticName==='string'?raw.logisticName.slice(0,120):'';
 const trackingNumber=typeof raw.trackNumber==='string'?raw.trackNumber.trim().slice(0,191):'';
 // Tracking is optional enrichment: an unavailable carrier lookup must not erase
 // proven order progress, and its status alone cannot prove delivery.
 const tracking=trackingNumber?await getTracking(trackingNumber).catch(()=>null):null;
 let lastTrackNumber='';
 if(tracking?.ok&&tracking.data.trackNumber===trackingNumber){carrier=tracking.data.lastMileCarrier?.slice(0,120)||carrier;lastTrackNumber=tracking.data.lastTrackNumber?.slice(0,191)||'';}
 // CJ's documented logistics portal supports its tracking numbers. Do not invent
 // carrier-specific URL templates or query parameters not provided by CJ.
 const trackingUrl=safeTrackingUrl(raw.trackingUrl)||(trackingNumber?'https://www.cjpacket.com/':null);
 await prisma.$transaction(async tx=>{
  const [pointer]=await tx.$queryRaw<{commerce_order_id:bigint}[]>`SELECT commerce_order_id FROM commerce_cj_fulfillment_outbox WHERE id=${BigInt(id)}`;
  if(!pointer)return;
  // Match bank settlement, receipt confirmation and worker CAS: order first,
  // then its outbox. Provider reads above never hold database locks.
  const [lockedOrder]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_orders WHERE id=${pointer.commerce_order_id} AND status='paid' AND currency='SAR' FOR UPDATE`;
  if(!lockedOrder)return;
  const [stored]=await tx.$queryRaw<{commerce_order_id:bigint;evidence_json:unknown;member_id:bigint}[]>`SELECT f.commerce_order_id,f.evidence_json,o.member_id FROM commerce_cj_fulfillment_outbox f JOIN commerce_orders o ON o.id=f.commerce_order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency='SAR' WHERE f.id=${BigInt(id)} AND f.cj_order_id=${row.cjOrderId} AND f.status='supplier_paid' AND o.status='paid' FOR UPDATE`;
  if(!stored)return;const meta=parseMeta(stored.evidence_json),previous=meta.fulfillment?.stage||'supplier_paid';
  const stage=observed&&ranks[observed]>=ranks[previous]?observed:previous;
  const next={stage,carrier:carrier||meta.fulfillment?.carrier||'',trackingNumber:trackingNumber||meta.fulfillment?.trackingNumber||'',lastTrackNumber:lastTrackNumber||meta.fulfillment?.lastTrackNumber||'',trackingUrl:trackingUrl||meta.fulfillment?.trackingUrl||null,observedAt:new Date().toISOString()};
  const exception=String(raw.orderStatus).toUpperCase()==='CANCELLED'?{actionRequired:true,source:'cj' as const,orderStatus:'CANCELLED',observedAt:next.observedAt}:meta.exception;
  await tx.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET evidence_json=${JSON.stringify({...meta,fulfillment:next,exception})},version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${BigInt(id)}`;
  // Aggregate the least advanced fulfillment group; one delivered parcel cannot complete a multi-group order.
  // Read current group versions after the order lock, not the snapshot created
  // by the pointer lookup before a concurrent reconciliation completed.
  const groups=await tx.$queryRaw<{status:string;evidence_json:unknown}[]>`SELECT status,evidence_json FROM commerce_cj_fulfillment_outbox WHERE commerce_order_id=${stored.commerce_order_id} FOR UPDATE`;
  if(groups.length&&groups.every(g=>g.status==='supplier_paid')){
   const stages=groups.map(g=>parseMeta(g.evidence_json).fulfillment?.stage||'supplier_paid');const aggregate=exception?.actionRequired||groups.some(g=>parseMeta(g.evidence_json).exception?.actionRequired)?'action_required':stages.reduce((a,b)=>ranks[a]<ranks[b]?a:b);
   await tx.$executeRaw`UPDATE commerce_orders SET fulfillment_status=${aggregate} WHERE id=${stored.commerce_order_id} AND status='paid' AND fulfillment_status<>'completed'`;
  }
  const event=`ship:cj:${createHash('sha256').update(JSON.stringify([id,exception?.actionRequired?'action_required':stage,next.trackingNumber,next.lastTrackNumber])).digest('hex').slice(0,30)}`;
  const payload=JSON.stringify({orderId:String(stored.commerce_order_id),supplierPaymentVerified:true,fulfillmentStatus:exception?.actionRequired?'action_required':stage,sourceException:exception?.orderStatus,carrier:next.carrier,trackingNumber:next.trackingNumber,lastTrackNumber:next.lastTrackNumber,trackingUrl:next.trackingUrl});
  await tx.$executeRaw`INSERT INTO commerce_notifications(order_id,event,channel,recipient,payload) VALUES(${stored.commerce_order_id},${event},'in_app',${'member:'+stored.member_id},${payload}) ON DUPLICATE KEY UPDATE id=id`;
 });
}
export async function selectCjFulfillmentBatch(limit=20):Promise<string[]> {
 if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('cj_fulfillment_batch_limit');
 const rows=await prisma.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_cj_fulfillment_outbox WHERE status<>'blocked' ORDER BY updated_at ASC,id ASC LIMIT ${limit}`;
 return rows.map(r=>String(r.id));
}
export async function memberCjOrderTracking(orderId:bigint,memberId:bigint){
 const rows=await prisma.$queryRaw<{id:bigint;evidence_json:unknown}[]>`SELECT f.id,f.evidence_json FROM commerce_cj_fulfillment_outbox f JOIN commerce_orders o ON o.id=f.commerce_order_id WHERE f.commerce_order_id=${orderId} AND o.member_id=${memberId} AND o.status='paid' AND f.status='supplier_paid' ORDER BY f.id LIMIT 100`;
 return rows.flatMap(row=>{const meta=parseMeta(row.evidence_json),f=meta.fulfillment;const stage=meta.exception?.actionRequired?'action_required':f?.stage;return f?[{id:`cj-${row.id}`,carrier:f.carrier,trackingNumber:f.trackingNumber,...(f.lastTrackNumber?{lastTrackNumber:f.lastTrackNumber}:{}),status:stage!,fulfillmentStatus:stage!,trackingUrl:safeTrackingUrl(f.trackingUrl)}]:[];});
}
