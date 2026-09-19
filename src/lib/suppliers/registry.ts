import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import type {SupplierAdapter} from './types';
import {accessTokenForConnection} from './connections';
import {SallaAdapter} from './providers/salla';

export async function adapterForConnection(db:CommerceDb,id:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<SupplierAdapter>{
  if(id<=0n)throw new Error('supplier_connection_unavailable');
  const [row]=await db.$queryRaw<{provider:string;status:string;active:number;maintenance:number}[]>`SELECT c.provider,c.status,s.active,p.maintenance FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${id}`;
  if(!row||row.status!=='connected'||row.active!==1||row.maintenance!==0)throw new Error('supplier_connection_unavailable');
  if(row.provider!=='salla')throw new Error('supplier_provider_unsupported');
  return new SallaAdapter(()=>accessTokenForConnection(db,id,config,fetcher),fetcher);
}
