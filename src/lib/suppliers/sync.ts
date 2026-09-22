import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import {assertSupplierSchemaReady} from './schema';
import {adapterForConnection} from './registry';
import {assertSyncGate,upsertClaimedSourceProduct,type SyncGate} from './catalog';
import {SALLA_OAUTH_SCOPE_VERSION} from './salla-scope-contract';

const MAX_PAGES=100;
const LEASE_MS=5*60*1000;
type RemovalCandidate={id:bigint;supplier_id:bigint;external_id:string;commerce_product_id:bigint|null;last_sync_at:Date|null};

/** Lock the whole removal set before the connection fence, in the same order as
 * catalog/admin/checkout: commerce first, then source products, then connection.
 * Completion and removals share one transaction, so a failed finish removes none. */
async function lockMissingProducts(tx:Prisma.TransactionClient,connectionId:bigint,seen:ReadonlySet<string>,startedAt:Date):Promise<RemovalCandidate[]>{
  const rows=await tx.$queryRaw<RemovalCandidate[]>`SELECT id,supplier_id,external_id,commerce_product_id,last_sync_at FROM supplier_products WHERE connection_id=${connectionId} AND (last_sync_at IS NULL OR last_sync_at<${startedAt}) ORDER BY id`;
  const missing=rows.filter(row=>!seen.has(row.external_id));
  const commerceIds=[...new Set(missing.flatMap(row=>row.commerce_product_id===null?[]:[row.commerce_product_id]))].sort((a,b)=>a<b?-1:a>b?1:0);
  for(const id of commerceIds){
    const [stock]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_products WHERE id=${id} FOR UPDATE`;
    if(!stock)throw new Error('supplier_mapping_invalid');
  }
  const locked:RemovalCandidate[]=[];
  for(const lookup of missing){
    const [row]=await tx.$queryRaw<RemovalCandidate[]>`SELECT id,supplier_id,external_id,commerce_product_id,last_sync_at FROM supplier_products WHERE id=${lookup.id} AND connection_id=${connectionId} FOR UPDATE`;
    // A webhook committed after the initial scan must win, including a timestamp
    // equal to the run start (DATETIME(3) cannot order events within a millisecond).
    if(!row||seen.has(row.external_id)||row.last_sync_at&&row.last_sync_at>=startedAt)continue;
    if(row.commerce_product_id!==lookup.commerce_product_id)throw new Error('supplier_mapping_changed');
    locked.push(row);
  }
  return locked;
}

export async function syncConnection(db:CommerceDb,connectionId:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<{imported:number}>{
  if(connectionId<=0n)throw new Error('supplier_connection_unavailable');
  await assertSupplierSchemaReady(db);
  const claim=randomUUID();
  const startedAt=await db.$transaction(async tx=>{
    const [gate]=await tx.$queryRaw<(SyncGate&{sync_claimed_at:Date|null})[]>`SELECT c.supplier_id,c.provider,c.status,c.sync_claim,c.sync_claimed_at,s.active,p.maintenance,p.sync_enabled,p.mode FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${connectionId} FOR UPDATE`;
    assertSyncGate(gate,gate?.sync_claim??null);
    if(gate.sync_claim&&(!gate.sync_claimed_at||gate.sync_claimed_at.getTime()>Date.now()-LEASE_MS))throw new Error('supplier_sync_busy');
    await tx.$executeRaw`UPDATE supplier_connections SET sync_claim=${claim},sync_claimed_at=UTC_TIMESTAMP(3) WHERE id=${connectionId}`;
    // Same database clock as supplier_products.last_sync_at; never use host time
    // or the renewable lease timestamp as the absence cutoff.
    const [clock]=await tx.$queryRaw<{started_at:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS started_at`;
    return clock.started_at;
  });
  let imported=0;
  try{
    const adapter=await adapterForConnection(db,connectionId,config,fetcher);
    let cursor:string|null=null;
    const cursors=new Set<string>();
    const seen=new Set<string>();
    for(let page=0;page<MAX_PAGES;page++){
      await db.$transaction(async tx=>{
        const changed=await tx.$executeRaw`UPDATE supplier_connections SET sync_claimed_at=UTC_TIMESTAMP(3) WHERE id=${connectionId} AND sync_claim=${claim} AND status='connected'`;
        if(changed!==1)throw new Error('supplier_sync_claim_lost');
      });
      const result=await adapter.getProducts({cursor,limit:50});
      for(const product of result.products){await upsertClaimedSourceProduct(db,connectionId,product,claim);seen.add(product.externalId);imported++;}
      if(result.nextCursor===null){
        await db.$transaction(async tx=>{
          const missing=await lockMissingProducts(tx,connectionId,seen,startedAt);
          const [gate]=await tx.$queryRaw<SyncGate[]>`SELECT c.supplier_id,c.provider,c.status,c.sync_claim,s.active,p.maintenance,p.sync_enabled,p.mode FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${connectionId} FOR UPDATE`;
          assertSyncGate(gate,claim);
          for(const row of missing){
            if(row.supplier_id!==gate.supplier_id)throw new Error('supplier_mapping_invalid');
            await tx.$executeRaw`UPDATE supplier_products SET available=0,quantity=0,last_sync_at=CURRENT_TIMESTAMP(3),sync_error='source_removed',revision=revision+1 WHERE id=${row.id}`;
            if(row.commerce_product_id!==null)await tx.$executeRaw`UPDATE commerce_products SET stock_available=0,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${row.commerce_product_id}`;
          }
          await tx.$executeRaw`UPDATE supplier_integration_profiles SET last_sync_at=CURRENT_TIMESTAMP(3),last_error='' WHERE supplier_id=${gate.supplier_id}`;
          await tx.$executeRaw`UPDATE supplier_connections SET sync_claim=NULL,sync_claimed_at=NULL WHERE id=${connectionId} AND sync_claim=${claim}`;
        },{isolationLevel:'ReadCommitted'});
        return {imported};
      }
      if(cursors.has(result.nextCursor))throw new Error('supplier_sync_pagination');
      cursors.add(result.nextCursor);cursor=result.nextCursor;
    }
    throw new Error('supplier_sync_page_limit');
  }catch(error){
    // Never persist thrown provider text: it can contain tokens, customer data or SQL values.
    const code=error instanceof Error&&/^supplier_sync_(?:page_limit|pagination|claim_lost|unavailable)$/.test(error.message)?error.message:'supplier_sync_failed';
    await db.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE supplier_integration_profiles p JOIN supplier_connections c ON c.supplier_id=p.supplier_id SET p.last_error=${code} WHERE c.id=${connectionId} AND c.sync_claim=${claim}`;
      await tx.$executeRaw`UPDATE supplier_connections SET sync_claim=NULL,sync_claimed_at=NULL WHERE id=${connectionId} AND sync_claim=${claim}`;
    });
    throw new Error(code);
  }
}

/** Initial read-only catalog sync after a verified OAuth callback. Products stay hidden and inactive. */
export async function syncAuthorizedSupplier(db:CommerceDb,supplierId:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<{imported:number}>{
 const [connection]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_connections WHERE supplier_id=${supplierId} AND provider='salla' AND status='connected' AND oauth_scope_version=${SALLA_OAUTH_SCOPE_VERSION} AND encrypted_tokens IS NOT NULL ORDER BY id LIMIT 1`;
 if(!connection)throw new Error('supplier_connection_unavailable');
 return syncConnection(db,connection.id,config,fetcher);
}
