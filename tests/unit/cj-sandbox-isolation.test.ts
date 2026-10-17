import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/cj/client',()=>({cjFulfillmentTransport:vi.fn(),getCjBalance:vi.fn(),getCjBillingHistory:vi.fn(),getVariants:vi.fn()}));
import {makeFulfillmentProvider} from '@/lib/cj/fulfillment/provider';
import {cjFulfillmentTransport,getVariants} from '@/lib/cj/client';
import type {Commitment} from '@/lib/cj/fulfillment/worker';
beforeEach(()=>vi.clearAllMocks());
describe('sandbox data cannot prove real fulfillment',()=>{
 it.each([1,'1',true,undefined,null,'true','unknown',2])('rejects sandbox flag %s before acceptance/payment checks',async flag=>{
 vi.mocked(cjFulfillmentTransport).mockResolvedValueOnce({ok:true,data:{orderId:'sbx-order',isSandbox:flag,paymentDate:'2026-10-17T00:00:00Z',orderStatus:'SHIPPED',currency:'USD'}});
 await expect(makeFulfillmentProvider({lines:[{pid:'pid'}],destination:{}} as unknown as Commitment).detail('sbx-order')).rejects.toThrow('sandbox_order_not_live_evidence');expect(getVariants).not.toHaveBeenCalled();
 });
 it.each([0,'0',false])('accepts affirmative live classification %s',async flag=>{vi.mocked(cjFulfillmentTransport).mockResolvedValueOnce({ok:true,data:{orderId:'live-order',isSandbox:flag}});const proof=await makeFulfillmentProvider({lines:[],destination:{}} as unknown as Commitment).detail('live-order');expect(proof.orderId).toBe('live-order');});
 it('rejects missing classification in a supplied reconciliation snapshot before any provider reads',async()=>{await expect(makeFulfillmentProvider({lines:[{pid:'pid'}],destination:{}} as unknown as Commitment,{orderId:'live-order'}).detail('live-order')).rejects.toThrow('sandbox_order_not_live_evidence');expect(cjFulfillmentTransport).not.toHaveBeenCalled();expect(getVariants).not.toHaveBeenCalled();});
});
