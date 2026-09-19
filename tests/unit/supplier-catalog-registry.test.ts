import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from '@/lib/suppliers/config';
vi.mock('@/lib/suppliers/connections',()=>({accessTokenForConnection:vi.fn().mockResolvedValue('token')}));
import {adapterForConnection} from '@/lib/suppliers/registry';
describe('supplier adapter registry',()=>{
  it.each(['cj','other'])('fails closed for unimplemented %s',async provider=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([{provider,status:'connected',active:1,maintenance:0}])} as unknown as CommerceDb;
    await expect(adapterForConnection(db,1n,{} as SupplierConfig)).rejects.toThrow('supplier_provider_unsupported');
  });
  it.each([{status:'disconnected'},{active:0},{maintenance:1}])('rejects unavailable connections %j',async changes=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([{provider:'salla',status:'connected',active:1,maintenance:0,...changes}])} as unknown as CommerceDb;
    await expect(adapterForConnection(db,1n,{} as SupplierConfig)).rejects.toThrow('supplier_connection_unavailable');
  });
});
