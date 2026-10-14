import {describe,it,expect,vi} from 'vitest';
import {prepareSettlementPaymentLinks} from '@/lib/cj/settlements/payment-preparation';
describe('non-financial selected payment preparation',()=>{
 it.each([1,10])('prepares %i independently accounted orders',async count=>{const prepare=vi.fn(async()=>{});const result=await prepareSettlementPaymentLinks(Array.from({length:count},(_,i)=>({id:String(i+1),status:'pending'})),prepare);expect(prepare).toHaveBeenCalledTimes(count);expect(result.failedIds).toEqual([]);});
 it('skips paid lines and preserves failed identifiers without retrying',async()=>{const prepare=vi.fn(async(id:string)=>{if(id==='2')throw Error('connection uncertain');});const result=await prepareSettlementPaymentLinks([{id:'1',status:'paid'},{id:'2',status:'pending'},{id:'3',status:'pending'}],prepare);expect(prepare.mock.calls).toEqual([['2'],['3']]);expect(result.failedIds).toEqual(['2']);});
});
