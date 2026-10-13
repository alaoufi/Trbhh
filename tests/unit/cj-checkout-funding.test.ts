import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('@/lib/cj/private-trial',()=>({requireCjLiveTrialAuthority:vi.fn().mockResolvedValue(undefined)}));
import {checkCjCheckoutFunding} from '@/lib/cj/checkout-funding';
function db(values:number[]){return {$queryRaw:vi.fn().mockResolvedValue(values.map(supplierUsdMinor=>({quote_json:{supplierUsdMinor}})))};}
describe('CJ wallet prebank readiness',()=>{
 beforeEach(()=>{vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());
 it.each(['false',undefined,'1','TRUE'])('blocks CJ bank checkout when worker flag is %s',async flag=>{vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED',flag);const balance=vi.fn();expect(await checkCjCheckoutFunding(db([101]) as never,{memberId:1n,orderId:2n},balance)).toBe('unavailable');expect(balance).not.toHaveBeenCalled();});
 it('blocks customer bank checkout if supplier ordering was disabled since quote creation',async()=>{vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');const balance=vi.fn();expect(await checkCjCheckoutFunding(db([101]) as never,{memberId:1n,orderId:2n},balance)).toBe('unavailable');expect(balance).not.toHaveBeenCalled();});
 it('does not require supplier balance for nonCJ checkout',async()=>{const balance=vi.fn();expect(await checkCjCheckoutFunding(db([]) as never,{memberId:1n,orderId:2n},balance)).toBe('ready');expect(balance).not.toHaveBeenCalled();});
 it('blocks customer bank creation when summed USD commitments exceed available balance',async()=>{const balance=vi.fn().mockResolvedValue({ok:true,data:{amountUsd:3,bonusUsd:100,frozenUsd:100}});expect(await checkCjCheckoutFunding(db([101,200]) as never,{memberId:1n,orderId:2n},balance)).toBe('funding_required');});
 it('permits the exact sufficient available USD amount',async()=>{const balance=vi.fn().mockResolvedValue({ok:true,data:{amountUsd:3.01,bonusUsd:0,frozenUsd:0}});expect(await checkCjCheckoutFunding(db([101,200]) as never,{memberId:1n,orderId:2n},balance)).toBe('ready');});
 it.each([null,undefined,NaN,1.001])('blocks missing or ambiguous available amount %s',async amountUsd=>{const balance=vi.fn().mockResolvedValue({ok:true,data:{amountUsd}});expect(await checkCjCheckoutFunding(db([101]) as never,{memberId:1n,orderId:2n},balance)).toBe('unavailable');});
 it('blocks bank creation when provider cannot read balance',async()=>{const balance=vi.fn().mockRejectedValue(new Error('timeout'));expect(await checkCjCheckoutFunding(db([101]) as never,{memberId:1n,orderId:2n},balance)).toBe('unavailable');});
});
