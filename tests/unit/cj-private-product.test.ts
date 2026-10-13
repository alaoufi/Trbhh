import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/cj/private-trial',()=>({requireCjLiveTrialAuthority:vi.fn().mockResolvedValue(undefined)}));
import {ensurePrivateCjCommerceProduct} from '@/lib/cj/private-product';
function fixture(mapping:bigint|null=null){const query=vi.fn().mockResolvedValueOnce([{id:4n,cj_product_id:'P',commerce_product_id:mapping,name_ar:'خاص',name:'Private',hidden:0}]).mockResolvedValueOnce([{id:2n}]),execute=vi.fn();const tx={$queryRaw:query,$executeRaw:execute};return {query,execute,db:{$transaction:async<T>(run:(tx:unknown)=>Promise<T>)=>run(tx)}};}
describe('private CJ commerce mapping',()=>{
 it('reuses a locked mapping without changing public flags or product data',async()=>{const f=fixture(12n);expect(await ensurePrivateCjCommerceProduct(f.db as never,{memberId:7n,cjRowId:4,pid:'P',unitSarMinor:500,verifiedQuantity:2})).toBe(12n);expect(f.execute).not.toHaveBeenCalled();});
 it('creates a private disabled/unapproved/unlisted mapping and links the same CJ row',async()=>{const f=fixture();expect(await ensurePrivateCjCommerceProduct(f.db as never,{memberId:7n,cjRowId:4,pid:'P',unitSarMinor:500,verifiedQuantity:2})).toBe(2n);const sql=f.execute.mock.calls[0][0].join('?');expect(sql).toContain('approved,visible,enabled');expect(sql).toContain("'SAR'");expect(sql).toContain('0,0,0');expect(f.execute.mock.calls[1].slice(1)).toEqual([2n,4n]);});
});
