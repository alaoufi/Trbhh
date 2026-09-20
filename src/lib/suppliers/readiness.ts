import 'server-only';
import {randomUUID} from 'node:crypto';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import {accessTokenForConnection} from './connections';
import {merchantIdentity} from './salla-oauth';
import {SallaAdapter} from './providers/salla';

const CLAIM_MS=120000;
const THROTTLE_MS=30000;
const codes=['supplier_readiness_pending','supplier_readiness_busy','supplier_readiness_throttled','supplier_readiness_registration_missing','supplier_readiness_ok',
  'supplier_readiness_empty_catalog','supplier_readiness_connection_unavailable',
  'supplier_readiness_connection_changed','supplier_readiness_token_failed',
  'supplier_readiness_identity_failed','supplier_readiness_identity_mismatch',
  'supplier_readiness_catalog_failed'] as const;
export type SupplierReadinessCode=typeof codes[number];
export type SupplierReadinessResult={
  status:'pending'|'running'|'ready'|'failed';code:SupplierReadinessCode;
  sampleCount:number;checkedConnectionVersion:number|null;checkedAt:Date|null;
};
type Connection={id:bigint;external_store_id:string;version:number;provider:string;status:string;active:number;maintenance:number};
type Check={checked_connection_version:number|null;checked_at:Date|null;check_status:string;check_code:string;check_sample_count:number;check_claim:string|null;check_claimed_at:Date|null};
type Reader=Pick<CommerceDb,'$queryRaw'>;
const result=(status:SupplierReadinessResult['status'],code:SupplierReadinessCode,sampleCount=0,checkedConnectionVersion:number|null=null,checkedAt:Date|null=null):SupplierReadinessResult=>({status,code,sampleCount,checkedConnectionVersion,checkedAt});
const changed=()=>result('pending','supplier_readiness_connection_changed');

async function connectionForSupplier(db:Reader,supplierId:bigint):Promise<Connection|null>{
  // The onboarding contract has no connection_id. Never treat equal versions of
  // different stores as the same check; ambiguous suppliers require resolution.
  const rows=await db.$queryRaw<Connection[]>`SELECT c.id,c.external_store_id,c.version,c.provider,c.status,s.active,p.maintenance FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.supplier_id=${supplierId} AND c.provider='salla' ORDER BY c.id LIMIT 2`;
  const row=rows[0];
  return rows.length===1&&row.provider==='salla'&&row.status==='connected'&&row.active===1&&row.maintenance===0?row:null;
}
function sameConnection(a:Connection,b:Connection|null):boolean {
  return !!b&&a.id===b.id&&a.external_store_id===b.external_store_id&&a.version===b.version;
}

/** Read through this projection: raw persisted ready can be stale after OAuth,
 * refresh or disconnect. Caller must authorize the administrative operation. */
export async function getSupplierReadiness(db:CommerceDb,supplierId:bigint):Promise<SupplierReadinessResult>{
  if(supplierId<=0n)return result('pending','supplier_readiness_pending');
  try{return await db.$transaction(async tx=>{
    const [row]=await tx.$queryRaw<Check[]>`SELECT checked_connection_version,checked_at,check_status,check_code,check_sample_count,check_claim,check_claimed_at FROM supplier_onboarding WHERE supplier_id=${supplierId}`;
    if(!row)return result('pending','supplier_readiness_pending');
    const connection=await connectionForSupplier(tx,supplierId);
    if(!connection)return changed();
    if(row.check_status==='running'&&row.check_claim&&row.check_claimed_at&&row.check_claimed_at.getTime()>Date.now()-CLAIM_MS)return result('running','supplier_readiness_busy');
    if(row.checked_connection_version!==connection.version||!row.checked_at)return changed();
    const code=codes.find(code=>code===row.check_code);
    if(!code||!['ready','failed'].includes(row.check_status))return result('pending','supplier_readiness_pending');
    if(row.check_status==='ready'&&!(code==='supplier_readiness_ok'&&row.check_sample_count===1||code==='supplier_readiness_empty_catalog'&&row.check_sample_count===0))return changed();
    return result(row.check_status as 'ready'|'failed',code,row.check_status==='ready'?row.check_sample_count:0,row.checked_connection_version,row.checked_at);
  },{isolationLevel:'RepeatableRead'});}catch{throw new Error('supplier_readiness_storage_failed');}
}

/** One merchant GET and at most one catalog GET; no catalog writes or orders.
 * Existing token service alone owns refresh (which can POST to the token host).
 * MAIN owns supplier_onboarding DDL and caller RBAC. Never start OAuth here. */
export type SupplierReadinessTestResult={status:'ready'|'failed';code:string;sampleCount:number};
export async function testSupplierReadiness(db:CommerceDb,supplierId:bigint,adminId:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<SupplierReadinessTestResult>{
  const check=await runReadiness(db,supplierId,adminId,config,fetcher);
  return {status:check.status==='ready'?'ready':'failed',code:check.code,sampleCount:check.sampleCount};
}

async function runReadiness(db:CommerceDb,supplierId:bigint,adminId:bigint,config:SupplierConfig,fetcher:typeof fetch):Promise<SupplierReadinessResult>{
  if(supplierId<=0n||adminId<=0n)throw new Error('supplier_readiness_invalid_input');
  const claim=randomUUID();
  try{
    const acquired=await db.$transaction(async tx=>{
      const [row]=await tx.$queryRaw<Check[]>`SELECT check_claim,check_claimed_at,checked_at,checked_connection_version FROM supplier_onboarding WHERE supplier_id=${supplierId} FOR UPDATE`;
      if(!row)return 'supplier_readiness_registration_missing' as const;
      if(row.check_claim&&(!row.check_claimed_at||row.check_claimed_at.getTime()>Date.now()-CLAIM_MS))return 'supplier_readiness_busy' as const;
      if(!row.check_claim&&row.checked_at&&row.checked_at.getTime()>Date.now()-THROTTLE_MS){
        const current=await connectionForSupplier(tx,supplierId);
        if((current?.version??null)===row.checked_connection_version)return 'supplier_readiness_throttled' as const;
      }
      await tx.$executeRaw`UPDATE supplier_onboarding SET check_claim=${claim},check_claimed_at=UTC_TIMESTAMP(3),check_status='running',check_code='',check_sample_count=0,checked_connection_version=NULL,checked_at=NULL WHERE supplier_id=${supplierId}`;
      return null;
    });
    if(acquired)return result('running',acquired);

    let connection:Connection|null=null;
    let status:SupplierReadinessResult['status']='failed';
    let code:SupplierReadinessCode='supplier_readiness_connection_unavailable';
    let sampleCount=0;
    try{
      connection=await connectionForSupplier(db,supplierId);
      if(connection){
        code='supplier_readiness_token_failed';
        let token=await accessTokenForConnection(db,connection.id,config,fetcher);
        let after=await connectionForSupplier(db,supplierId);
        if(!sameConnection(connection,after)){
          // Refresh increments version. Re-read the token once against the new
          // snapshot rather than attaching the old token to a concurrent OAuth.
          if(!after||connection.id!==after.id||connection.external_store_id!==after.external_store_id){code='supplier_readiness_connection_changed';throw new Error();}
          connection=after;
          token=await accessTokenForConnection(db,connection.id,config,fetcher);
          after=await connectionForSupplier(db,supplierId);
          if(!sameConnection(connection,after)){code='supplier_readiness_connection_changed';throw new Error();}
        }
        code='supplier_readiness_identity_failed';
        const identity=await merchantIdentity(token,fetcher);
        if(identity!==connection.external_store_id){code='supplier_readiness_identity_mismatch';throw new Error();}
        code='supplier_readiness_catalog_failed';
        // Pin the exact merchant-verified token; the registry's lazy token reader
        // could otherwise rotate credentials between identity and catalog GETs.
        const adapter=new SallaAdapter(async()=>token,fetcher);
        const page=await adapter.getProducts({limit:1});
        sampleCount=page.products.length;
        status='ready';code=sampleCount?'supplier_readiness_ok':'supplier_readiness_empty_catalog';
      }
    }catch{
      // Never inspect, persist or propagate provider/DB error messages or bodies.
      sampleCount=0;
    }

    return await db.$transaction(async tx=>{
      const checkedAt=new Date();
      if(connection){
        const saved=await tx.$executeRaw`UPDATE supplier_onboarding o JOIN supplier_connections c ON c.supplier_id=o.supplier_id JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider SET o.check_status=${status},o.check_code=${code},o.check_sample_count=${sampleCount},o.checked_connection_version=${connection.version},o.checked_at=UTC_TIMESTAMP(3),o.check_claim=NULL,o.check_claimed_at=NULL WHERE o.supplier_id=${supplierId} AND o.check_claim=${claim} AND o.check_status='running' AND o.check_claimed_at>UTC_TIMESTAMP(3)-INTERVAL 120 SECOND AND c.id=${connection.id} AND c.version=${connection.version} AND c.external_store_id=${connection.external_store_id} AND c.provider='salla' AND c.status='connected' AND s.active=1 AND p.maintenance=0 AND NOT EXISTS (SELECT 1 FROM supplier_connections other_connection WHERE other_connection.supplier_id=c.supplier_id AND other_connection.provider='salla' AND other_connection.id<>c.id)`;
        if(saved===1){
          await tx.admin_log.create({data:{admin_id:adminId,action:'supplier_readiness_check',target:String(supplierId),note:code}});
          return result(status,code,sampleCount,connection.version,checkedAt);
        }
        status='pending';code='supplier_readiness_connection_changed';
      }
      const saved=await tx.$executeRaw`UPDATE supplier_onboarding SET check_status=${status},check_code=${code},check_sample_count=0,checked_connection_version=NULL,checked_at=UTC_TIMESTAMP(3),check_claim=NULL,check_claimed_at=NULL WHERE supplier_id=${supplierId} AND check_claim=${claim} AND check_status='running'`;
      if(saved!==1)return changed();
      await tx.admin_log.create({data:{admin_id:adminId,action:'supplier_readiness_check',target:String(supplierId),note:code}});
      return result(status,code,0,null,checkedAt);
    });
  }catch{throw new Error('supplier_readiness_storage_failed');}
}
