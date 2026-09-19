import {describe,it,expect,vi} from 'vitest';
import {consumeOAuthState,accessTokenForConnection} from '@/lib/suppliers/connections';
import {sealTokens} from '@/lib/suppliers/crypto';
import {supplierConfig} from '@/lib/suppliers/config';
import type {CommerceDb} from '@/lib/commerce/types';
const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SALLA_CLIENT_ID:'test',SALLA_CLIENT_SECRET:'test',SUPPLIER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32)});
describe('durable OAuth boundaries',()=>{
 it('rejects malformed state before database access',async()=>{const db={$transaction:vi.fn()} as unknown as CommerceDb;await expect(consumeOAuthState(db,'bad','bad',1n)).rejects.toThrow('supplier_oauth_state');expect(db.$transaction).not.toHaveBeenCalled();});
 it('rejects consumed or foreign browser state atomically',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;await expect(consumeOAuthState(db,'a'.repeat(64),'b'.repeat(64),1n)).rejects.toThrow('supplier_oauth_state');expect(tx.$executeRaw).not.toHaveBeenCalled();});
 it('returns unexpired server token without refresh',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([{id:1n,supplier_id:2n,external_store_id:'3',status:'connected',active:1,maintenance:0,encrypted_tokens:sealTokens({accessToken:'access',refreshToken:'refresh'},'salla:2:3',config.encryptionKey),expires_at:new Date(Date.now()+86400000),refresh_claim:null,version:0}])};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;const fetcher=vi.fn();expect(await accessTokenForConnection(db,1n,config,fetcher)).toBe('access');expect(fetcher).not.toHaveBeenCalled();});
 it('never refreshes disabled suppliers',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([{active:0,status:'connected',maintenance:0}])};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;const fetcher=vi.fn();await expect(accessTokenForConnection(db,1n,config,fetcher)).rejects.toThrow('supplier_connection_unavailable');expect(fetcher).not.toHaveBeenCalled();});
});
