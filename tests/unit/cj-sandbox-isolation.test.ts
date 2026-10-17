import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/cj/client',()=>({cjFulfillmentTransport:vi.fn(),getCjBalance:vi.fn(),getCjBillingHistory:vi.fn(),getVariants:vi.fn()}));
import {makeFulfillmentProvider} from '@/lib/cj/fulfillment/provider';
import {cjFulfillmentTransport,getVariants} from '@/lib/cj/client';
import type {Commitment} from '@/lib/cj/fulfillment/worker';
describe('sandbox data cannot prove real fulfillment',()=>{
 it.each([1,'1',true])('rejects sandbox flag %s before acceptance/payment checks',async flag=>{
 vi.mocked(cjFulfillmentTransport).mockResolvedValueOnce({ok:true,data:{orderId:'sbx-order',isSandbox:flag,paymentDate:'2026-10-17T00:00:00Z',orderStatus:'SHIPPED',currency:'USD'}});
 await expect(makeFulfillmentProvider({lines:[]} as unknown as Commitment).detail('sbx-order')).rejects.toThrow('sandbox_order_not_live_evidence');expect(getVariants).not.toHaveBeenCalled();
 });
});
