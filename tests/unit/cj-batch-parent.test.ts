import {describe,it,expect,vi} from 'vitest';
import {prepareCjBatchParent} from '@/lib/cj/fulfillment/provider';
function fixture(n:number){
 const codes=Array.from({length:n},(_,i)=>`SD${i+1}`);
 const parent={submitSuccess:true,successOrders:codes,payId:'ONEPAY',payExpireTime:new Date(Date.now()+600000).toISOString(),orderMoney:n,paymentInformation:{payableAmount:n}};
 const transport=vi.fn(async(path:string)=>path.endsWith('addCart')?{successCount:n,addSuccessOrders:codes,interceptOrders:[]}:path.endsWith('addCartConfirm')?{successCount:n,submitSuccess:true,shipmentsId:'SHIP',interceptOrders:[]}:parent);
 return {codes,parent,transport};
}
describe('official CJ unified parent preparation (simulated)',()=>{
 it.each([1,10])('prepares %i separate CJ orders with one parent payId and exact membership',async n=>{const f=fixture(n);expect(await prepareCjBatchParent(f.codes,f.transport)).toMatchObject({payId:'ONEPAY',payableUsdMinor:n*100,paymentUrl:'https://www.cjdropshipping.com/mine/payment?pid=ONEPAY'});expect(f.transport).toHaveBeenCalledTimes(3);expect(f.transport).toHaveBeenNthCalledWith(1,'/shopping/order/addCart',{cjOrderIdList:f.codes});expect(f.transport).toHaveBeenNthCalledWith(2,'/shopping/order/addCartConfirm',{cjOrderIdList:f.codes});});
 it('rejects partial membership even when aggregate amount looks correct',async()=>{const f=fixture(10);f.parent.successOrders=f.codes.slice(0,9);await expect(prepareCjBatchParent(f.codes,f.transport)).rejects.toThrow('parent_membership_invalid');});
 it('rejects duplicate order codes before any mutation',async()=>{const f=fixture(1);await expect(prepareCjBatchParent(['SD1','SD1'],f.transport)).rejects.toThrow();expect(f.transport).not.toHaveBeenCalled();});
 it('does not replay an unknown parent outcome',async()=>{const f=fixture(10);f.transport.mockRejectedValueOnce(Error('connection_lost'));await expect(prepareCjBatchParent(f.codes,f.transport)).rejects.toThrow('connection_lost');expect(f.transport).toHaveBeenCalledTimes(1);});
 it('rejects expired payment identity',async()=>{const f=fixture(1);f.parent.payExpireTime='2020-01-01T00:00:00Z';await expect(prepareCjBatchParent(f.codes,f.transport)).rejects.toThrow('payment_expiry_invalid');});
});
