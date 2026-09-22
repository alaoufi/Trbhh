import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import type {SupplierAdapter} from './types';
import {accessTokenForConnection} from './connections';
import {SallaAdapter} from './providers/salla';
import {assertMerchantStoreMatches,merchantStoreIdentity} from './salla-oauth';

type SallaConnection={id:bigint;provider:string;status:string;active:number;maintenance:number;mode:string;external_store_id:string;store_url:string};
async function verifiedToken(db:CommerceDb,row:SallaConnection,config:SupplierConfig,fetcher:typeof fetch):Promise<string>{
  const token=await accessTokenForConnection(db,row.id,config,fetcher),identity=await merchantStoreIdentity(token,fetcher);
  assertMerchantStoreMatches(identity,row.external_store_id,row.store_url);return token;
}

export async function verifySupplierStoreIdentity(db:CommerceDb,supplierId:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<void>{
  const rows=await db.$queryRaw<SallaConnection[]>`SELECT c.id,c.provider,c.status,c.external_store_id,s.active,p.maintenance,p.mode,o.store_url FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider JOIN supplier_onboarding o ON o.supplier_id=c.supplier_id WHERE c.supplier_id=${supplierId} AND c.provider='salla' ORDER BY c.id LIMIT 2`;
  const row=rows[0];if(rows.length!==1||!row||row.status!=='connected'||row.active!==1||row.maintenance!==0)throw new Error('supplier_connection_unavailable');
  await verifiedToken(db,row,config,fetcher);
}

export async function adapterForConnection(db:CommerceDb,id:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<SupplierAdapter>{
  if(id<=0n)throw new Error('supplier_connection_unavailable');
  const [row]=await db.$queryRaw<SallaConnection[]>`SELECT c.id,c.provider,c.status,c.external_store_id,s.active,p.maintenance,p.mode,o.store_url FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider JOIN supplier_onboarding o ON o.supplier_id=c.supplier_id WHERE c.id=${id}`;
  if(row&&row.provider!=='salla')throw new Error('supplier_provider_unsupported');
  if(!row||row.status!=='connected'||row.active!==1||row.maintenance!==0)throw new Error('supplier_connection_unavailable');
  const token=await verifiedToken(db,row,config,fetcher);
  return new SallaAdapter(async()=>token,fetcher);
}
