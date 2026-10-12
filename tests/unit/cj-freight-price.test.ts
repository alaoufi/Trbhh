import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/cj/config',()=>({cjConfig:()=>({configured:true,base:'https://cj.invalid',encryptionKey:'test'})}));
vi.mock('@/lib/cj/store',()=>({readCjAuth:async()=>({tokens:{accessToken:'test'},accessExpiresAt:new Date(Date.now()+172800000)}),writeCjAuth:vi.fn()}));
import {calculateFreightToKSA} from '@/lib/cj/client';
afterEach(()=>vi.unstubAllGlobals());
describe('CJ freight price provenance',()=>{
  it('preserves explicit zero but never converts an absent or invalid provider price to free shipping',async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({code:200,result:true,data:[{logisticName:'Missing'},{logisticName:'Invalid',logisticPrice:'bad'},{logisticName:'Explicit free',logisticPrice:0},{logisticName:'Paid',logisticPrice:2.5}]})));
    vi.stubGlobal('fetch',fetchMock);
    const result=await calculateFreightToKSA([{vid:'test',quantity:2}]);
    expect(result.ok).toBe(true);
    if(result.ok){expect(Number.isNaN(result.data[0].logisticPrice)).toBe(true);expect(Number.isNaN(result.data[1].logisticPrice)).toBe(true);expect(result.data[2].logisticPrice).toBe(0);expect(result.data[3].logisticPrice).toBe(2.5);}
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
