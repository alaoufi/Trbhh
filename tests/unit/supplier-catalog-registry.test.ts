import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from '@/lib/suppliers/config';
vi.mock('@/lib/suppliers/connections',()=>({accessTokenForConnection:vi.fn().mockResolvedValue('token')}));
vi.mock('@/lib/suppliers/salla-oauth',()=>({merchantStoreIdentity:vi.fn().mockResolvedValue({id:'123',name:'Store',domain:'https://store.example'}),assertMerchantStoreMatches:vi.fn()}));
import {adapterForConnection} from '@/lib/suppliers/registry';
import {assertMerchantStoreMatches,merchantStoreIdentity} from '@/lib/suppliers/salla-oauth';
describe('supplier adapter registry',()=>{
  it.each(['cj','other'])('fails closed for unimplemented %s',async provider=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([{id:1n,provider,status:'connected',active:1,maintenance:0,mode:'live',external_store_id:'123',store_url:'https://store.example'}])} as unknown as CommerceDb;
    await expect(adapterForConnection(db,1n,{} as SupplierConfig)).rejects.toThrow('supplier_provider_unsupported');
  });
  it.each([{status:'disconnected'},{active:0},{maintenance:1}])('rejects unavailable connections %j',async changes=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([{id:1n,provider:'salla',status:'connected',active:1,maintenance:0,mode:'live',external_store_id:'123',store_url:'https://store.example',...changes}])} as unknown as CommerceDb;
    await expect(adapterForConnection(db,1n,{} as SupplierConfig)).rejects.toThrow('supplier_connection_unavailable');
  });
  it('verifies immutable merchant id and onboarded URL before returning the adapter',async()=>{
    const row={id:1n,provider:'salla',status:'connected',active:1,maintenance:0,mode:'live',external_store_id:'123',store_url:'https://store.example'};
    const db={$queryRaw:vi.fn().mockResolvedValue([row])} as unknown as CommerceDb;
    await adapterForConnection(db,1n,{} as SupplierConfig);
    expect(merchantStoreIdentity).toHaveBeenCalledWith('token',expect.any(Function));
    expect(assertMerchantStoreMatches).toHaveBeenCalledWith({id:'123',name:'Store',domain:'https://store.example'},'123','https://store.example');
  });
});
