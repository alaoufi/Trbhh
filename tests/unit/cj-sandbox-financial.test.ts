import {createRequire} from 'node:module';
import {describe,it,expect,vi} from 'vitest';
const {sandboxFinancialProbe,financialTransport}=createRequire(import.meta.url)('../../scripts/diagnostics/cj-sandbox-financial.cjs');
const reference='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
const detail={orderId:'261071053280661800',orderNum:reference,cjOrderCode:'SD261071053280661800',isSandbox:1,orderStatus:'UNPAID',productList:[{vid:'2610070813191630909',quantity:1}]};
describe('isolated sandbox financial continuation',()=>{
 it.each(['CREATED','IN_CART'])('does not simulate payment for unconfirmed status %s',async(orderStatus)=>{const api=vi.fn().mockResolvedValue({...detail,orderStatus}),claimOnce=vi.fn();await expect(sandboxFinancialProbe({api,claimOnce})).rejects.toThrow('sandbox_order_confirmation_required');expect(api).toHaveBeenCalledTimes(2);expect(claimOnce).not.toHaveBeenCalled();});
 it('backs off only safe reads on QPS rejection',async()=>{vi.useFakeTimers();try{const fetcher=vi.fn().mockResolvedValueOnce(Response.json({code:1600200,result:false})).mockResolvedValueOnce(Response.json({code:200,result:true,data:{ok:true}}));const promise=financialTransport('token',fetcher)('/shopping/order/getOrderDetail','GET',{orderId:reference});await vi.runAllTimersAsync();expect(await promise).toEqual({ok:true});expect(fetcher).toHaveBeenCalledTimes(2);}finally{vi.useRealTimers();}});
 it('uses the source SD code after independent identity confirmation and verifies payment and tracking',async()=>{
  const paid={...detail,orderStatus:'UNSHIPPED'},tracked={...paid,trackNumber:'TRBHH-SANDBOX-TEST-001'};
  const api=vi.fn().mockResolvedValueOnce(detail).mockResolvedValueOnce(detail).mockResolvedValueOnce(true).mockResolvedValueOnce(paid).mockResolvedValueOnce(true).mockResolvedValueOnce(tracked);
  expect(await sandboxFinancialProbe({api,claimOnce:vi.fn()})).toMatchObject({event:'CJ_SANDBOX_PAYMENT_TRACKING_VERIFIED',refundVerified:false});
  expect(api.mock.calls[2]).toEqual(['/shopping/sandbox/simulatePay','POST',{orderId:detail.cjOrderCode}]);
 });
 it('blocks live orders and missing codes before taking a lock or sending payment',async()=>{
  for(const d of [{...detail,isSandbox:0},{...detail,cjOrderCode:null}]){const api=vi.fn().mockResolvedValue(d),claimOnce=vi.fn();await expect(sandboxFinancialProbe({api,claimOnce})).rejects.toThrow();expect(api).toHaveBeenCalledTimes(1);expect(claimOnce).not.toHaveBeenCalled();}
 });
 it('rejects a code which reads back another order',async()=>{const api=vi.fn().mockResolvedValueOnce(detail).mockResolvedValueOnce({...detail,orderNum:'other'});await expect(sandboxFinancialProbe({api,claimOnce:vi.fn()})).rejects.toThrow('sandbox_identity_invalid');expect(api).toHaveBeenCalledTimes(2);});
 it('does not retry a rejected simulation or ambiguous network result',async()=>{const api=vi.fn().mockResolvedValueOnce(detail).mockResolvedValueOnce(detail).mockRejectedValueOnce(Error('timeout'));await expect(sandboxFinancialProbe({api,claimOnce:vi.fn()})).rejects.toThrow('timeout');expect(api).toHaveBeenCalledTimes(3);});
 it('blocks real payment/refund/create endpoints and numeric mutation IDs before HTTP',async()=>{const fetcher=vi.fn();const api=financialTransport('token',fetcher);for(const path of ['/shopping/pay/payBalanceV2','/shopping/order/createOrderV3','/disputes/create'])await expect(api(path,'POST',{orderId:detail.cjOrderCode})).rejects.toThrow('sandbox_endpoint_blocked');await expect(api('/shopping/sandbox/simulatePay','POST',{orderId:detail.orderId})).rejects.toThrow('sandbox_mutation_blocked');expect(fetcher).not.toHaveBeenCalled();});
});
