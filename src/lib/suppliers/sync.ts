import 'server-only';
import {randomUUID} from 'node:crypto';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import {assertSupplierSchemaReady} from './schema';
import {adapterForConnection} from './registry';
import {assertSyncGate,upsertClaimedSourceProduct,type SyncGate} from './catalog';

const MAX_PAGES=100;
const LEASE_MS=5*60*1000;
export async function syncConnection(db:CommerceDb,connectionId:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<{imported:number}>{
  if(connectionId<=0n)throw new Error('supplier_connection_unavailable');
  await assertSupplierSchemaReady(db);
  const claim=randomUUID();
  await db.$transaction(async tx=>{
    const [gate]=await tx.$queryRaw<(SyncGate&{sync_claimed_at:Date|null})[]>`SELECT c.supplier_id,c.provider,c.status,c.sync_claim,c.sync_claimed_at,s.active,p.maintenance,p.sync_enabled FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${connectionId} FOR UPDATE`;
    assertSyncGate(gate,gate?.sync_claim??null);
    if(gate.sync_claim&&(!gate.sync_claimed_at||gate.sync_claimed_at.getTime()>Date.now()-LEASE_MS))throw new Error('supplier_sync_busy');
    await tx.$executeRaw`UPDATE supplier_connections SET sync_claim=${claim},sync_claimed_at=UTC_TIMESTAMP(3) WHERE id=${connectionId}`;
  });
  let imported=0;
  try{
    const adapter=await adapterForConnection(db,connectionId,config,fetcher);
    let cursor:string|null=null;
    const cursors=new Set<string>();
    for(let page=0;page<MAX_PAGES;page++){
      await db.$transaction(async tx=>{
        const changed=await tx.$executeRaw`UPDATE supplier_connections SET sync_claimed_at=UTC_TIMESTAMP(3) WHERE id=${connectionId} AND sync_claim=${claim} AND status='connected'`;
        if(changed!==1)throw new Error('supplier_sync_claim_lost');
      });
      const result=await adapter.getProducts({cursor,limit:50});
      for(const product of result.products){await upsertClaimedSourceProduct(db,connectionId,product,claim);imported++;}
      if(result.nextCursor===null){
        await db.$transaction(async tx=>{
          const [gate]=await tx.$queryRaw<SyncGate[]>`SELECT c.supplier_id,c.provider,c.status,c.sync_claim,s.active,p.maintenance,p.sync_enabled FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${connectionId} FOR UPDATE`;
          assertSyncGate(gate,claim);
          await tx.$executeRaw`UPDATE supplier_integration_profiles SET last_sync_at=CURRENT_TIMESTAMP(3),last_error='' WHERE supplier_id=${gate.supplier_id}`;
          await tx.$executeRaw`UPDATE supplier_connections SET sync_claim=NULL,sync_claimed_at=NULL WHERE id=${connectionId} AND sync_claim=${claim}`;
        });
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
