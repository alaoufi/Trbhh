import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import {assertSupplierSchemaReady} from './schema';
import {adapterForConnection} from './registry';
import {upsertSourceProduct} from './catalog';
import {syncConnection} from './sync';
import {dispatchSupplierOrder} from './orders';
import {recordSupplierTracking,deliverSupplierNotices} from './tracking';

const MAX_ATTEMPTS=8;
type Inbox={id:bigint;connection_id:bigint;resource_id:string;event_type:string;payload:unknown;attempts:number};
/** Reuse the claim-locking transaction for source persistence: no late owner writes. */
function scopedDb(tx:Prisma.TransactionClient):CommerceDb {
 return {$queryRaw:tx.$queryRaw.bind(tx),$transaction:async(fn:(client:Prisma.TransactionClient)=>Promise<unknown>)=>fn(tx)} as CommerceDb;
}
async function missingProduct(tx:Prisma.TransactionClient,connectionId:bigint,externalId:string){
 const [lookup]=await tx.$queryRaw<{id:bigint;commerce_product_id:bigint|null}[]>`SELECT id,commerce_product_id FROM supplier_products WHERE connection_id=${connectionId} AND external_id=${externalId}`;
 if(!lookup)return;
 if(lookup.commerce_product_id)await tx.$queryRaw`SELECT id FROM commerce_products WHERE id=${lookup.commerce_product_id} FOR UPDATE`;
 const [product]=await tx.$queryRaw<{id:bigint;commerce_product_id:bigint|null}[]>`SELECT id,commerce_product_id FROM supplier_products WHERE id=${lookup.id} FOR UPDATE`;
 if(!product||product.commerce_product_id!==lookup.commerce_product_id)throw new Error('supplier_mapping_changed');
 const [gate]=await tx.$queryRaw<{active:number;maintenance:number;sync_enabled:number;status:string;sync_claim:string|null}[]>`SELECT s.active,p.maintenance,p.sync_enabled,c.status,c.sync_claim FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=s.id WHERE c.id=${connectionId} FOR SHARE`;
 if(!gate||gate.active!==1||gate.maintenance!==0||gate.sync_enabled!==1||gate.status!=='connected'||gate.sync_claim)throw new Error('supplier_sync_unavailable');
 await tx.$executeRaw`UPDATE supplier_products SET available=0,quantity=0,last_sync_at=CURRENT_TIMESTAMP(3),sync_error='source_missing',revision=revision+1 WHERE id=${product.id}`;
 if(product.commerce_product_id)await tx.$executeRaw`UPDATE commerce_products SET stock_available=0,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${product.commerce_product_id}`;
}

export async function processNextSupplierEvent(db:CommerceDb,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<'empty'|'done'|'failed'|'lost'>{
 const token=randomUUID();
 const event=await db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<Inbox[]>`SELECT id,connection_id,resource_id,event_type,payload,attempts FROM supplier_webhook_events WHERE attempts<${MAX_ATTEMPTS} AND ((status='pending' AND attempts=0) OR (status IN ('pending','failed') AND attempts>0 AND next_attempt_at<=UTC_TIMESTAMP(3)) OR (status='processing' AND claimed_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
  if(!row)return null;
  await tx.$executeRaw`UPDATE supplier_webhook_events SET status='processing',attempts=attempts+1,claim_token=${token},claimed_at=UTC_TIMESTAMP(3) WHERE id=${row.id}`;
  return row;
 });
 if(!event)return 'empty';
 try{
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  if(!payload||typeof payload!=='object'||!('kind' in payload)||!('occurredAt' in payload)||typeof payload.occurredAt!=='string'||!Number.isFinite(Date.parse(payload.occurredAt))||!['product','order'].includes(String(payload.kind))||!/^\d{1,30}$/.test(event.resource_id))throw new Error('supplier_event_invalid');
  const adapter=await adapterForConnection(db,event.connection_id,config,fetcher);
  // Network is GET-only and outside the DB transaction. The claim is rechecked before any writes.
  const product=payload.kind==='product'?await adapter.getProduct(event.resource_id):undefined;
  const order=payload.kind==='order'?await adapter.getOrder(event.resource_id):undefined;
  if(payload.kind==='order'&&!order)throw new Error('supplier_order_missing');
  return await db.$transaction(async tx=>{
   const [owned]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_webhook_events WHERE id=${event.id} AND status='processing' AND claim_token=${token} FOR UPDATE`;
   if(!owned)return 'lost' as const;
   if(product)await upsertSourceProduct(scopedDb(tx),event.connection_id,product);
   else if(payload.kind==='product')await missingProduct(tx,event.connection_id,event.resource_id);
   else if(order)await recordSupplierTracking(scopedDb(tx),event.connection_id,order,payload.occurredAt as string);
   await tx.$executeRaw`UPDATE supplier_webhook_events SET status='done',processed_at=UTC_TIMESTAMP(3),claim_token=NULL,claimed_at=NULL,last_error='' WHERE id=${event.id} AND claim_token=${token}`;
   return 'done' as const;
  },{isolationLevel:'ReadCommitted'});
 }catch{
  const retryAt=new Date(Date.now()+Math.min(3600000,30000*2**Math.min(event.attempts,7)));
  await db.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE supplier_webhook_events SET status='failed',next_attempt_at=${retryAt},last_error='supplier_event_retry',claim_token=NULL,claimed_at=NULL WHERE id=${event.id} AND claim_token=${token} AND status='processing'`;
  });
  return 'failed';
 }
}

export type ReconcileCounts={done:number;failed:number;synced:number;imported:number;dispatched:number;tracked:number};
export async function reconcileSuppliers(db:CommerceDb,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<ReconcileCounts>{
 await assertSupplierSchemaReady(db);
 const deadline=Date.now()+45000,signal=AbortSignal.timeout(45000);
 const boundedFetch:typeof fetch=(input,init)=>fetcher(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,signal]):signal});
 const counts:ReconcileCounts={done:0,failed:0,synced:0,imported:0,dispatched:0,tracked:0};
 const finish=async()=>{try{await deliverSupplierNotices(db,20);}catch{counts.failed++;}return counts;};
 for(let i=0;i<5&&Date.now()<deadline;i++){
  const outcome=await processNextSupplierEvent(db,config,boundedFetch);
  if(outcome==='empty')break;if(outcome==='done')counts.done++;if(outcome==='failed')counts.failed++;
 }
 if(Date.now()>=deadline)return finish();
 const pending=await db.$queryRaw<{id:bigint}[]>`SELECT so.id FROM supplier_orders so JOIN commerce_orders o ON o.id=so.order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE o.status='paid' AND so.status IN ('awaiting_payment','pending') ORDER BY so.id LIMIT 5`;
 for(const order of pending){if(Date.now()>=deadline)break;try{const result=await dispatchSupplierOrder(db,order.id,config);if(result.status==='simulated'||result.status==='submitted')counts.dispatched++;}catch{counts.failed++;}}
 if(Date.now()>=deadline)return finish();
 const tracking=await db.$queryRaw<{connection_id:bigint;external_order_id:string}[]>`SELECT so.connection_id,so.external_order_id FROM supplier_orders so JOIN supplier_connections c ON c.id=so.connection_id JOIN commerce_suppliers s ON s.id=so.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=s.id WHERE so.external_order_id IS NOT NULL AND so.status='submitted' AND c.status='connected' AND s.active=1 AND p.maintenance=0 AND so.updated_at<DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 15 MINUTE) ORDER BY so.updated_at,so.id LIMIT 2`;
 for(const row of tracking){if(Date.now()>=deadline)break;try{const observedAt=new Date().toISOString(),adapter=await adapterForConnection(db,row.connection_id,config,boundedFetch),order=await adapter.getOrder(row.external_order_id);if(order){await recordSupplierTracking(db,row.connection_id,order,observedAt);counts.tracked++;}}catch{counts.failed++;}}
 if(Date.now()+10000>=deadline)return finish();
 // At most one full catalog per request. Shared fetch deadline also bounds its 100-page cap.
 const connections=await db.$queryRaw<{id:bigint}[]>`SELECT c.id FROM supplier_connections c JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id JOIN commerce_suppliers s ON s.id=c.supplier_id WHERE c.provider='salla' AND c.status='connected' AND s.active=1 AND p.maintenance=0 AND p.sync_enabled=1 AND (c.sync_claim IS NULL OR c.sync_claimed_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) AND (p.last_sync_at IS NULL OR p.last_sync_at<DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 30 MINUTE)) AND c.updated_at<DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 5 MINUTE) ORDER BY c.updated_at,c.id LIMIT 1`;
 for(const row of connections){
  try{
   await db.$transaction(async tx=>{await tx.$executeRaw`UPDATE supplier_connections SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=${row.id}`;});
   const result=await syncConnection(db,row.id,config,boundedFetch);counts.synced++;counts.imported+=result.imported;
  }catch{counts.failed++;}
 }
 return finish();
}
