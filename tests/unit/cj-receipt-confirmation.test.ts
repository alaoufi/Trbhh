import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({query:vi.fn(),write:vi.fn(async()=>1)}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:f.query,$executeRaw:f.write})}}));
import {confirmCjOrderReceipt} from '@/lib/cj/fulfillment/receipt';
beforeEach(()=>vi.clearAllMocks());
describe('owned CJ order receipt confirmation',()=>{
 it.each(['nonowner','missing bank receipt'])('refuses %s without writes',async()=>{f.query.mockResolvedValueOnce([]);expect(await confirmCjOrderReceipt(1n,2n)).toEqual({ok:false,reason:'not_found_or_unpaid'});expect(f.write).not.toHaveBeenCalled();});
 it.each(['preparing','shipped','missing','cancelled'])('does not close partial/unknown/exception delivery %s',async(stage)=>{f.query.mockResolvedValueOnce([{id:1n,fulfillment_status:'delivered'}]).mockResolvedValueOnce([{status:'supplier_paid',evidence_json:{fulfillment:{stage:'delivered'}}},{status:stage==='missing'?null:'supplier_paid',evidence_json:{fulfillment:{stage:stage==='cancelled'?'delivered':stage},exception:stage==='cancelled'?{actionRequired:true}:undefined}}]);expect(await confirmCjOrderReceipt(1n,2n)).toEqual({ok:false,reason:'delivery_unverified'});expect(f.write).not.toHaveBeenCalled();});
 it('closes only after all groups delivered and persists a unique completion notice',async()=>{f.query.mockResolvedValueOnce([{id:1n,fulfillment_status:'delivered'}]).mockResolvedValueOnce([{status:'supplier_paid',evidence_json:{fulfillment:{stage:'delivered'}}}]);expect(await confirmCjOrderReceipt(1n,2n)).toEqual({ok:true,alreadyCompleted:false});const update=f.write.mock.calls[0] as unknown[];expect(String((update[0] as string[]).join(''))).toContain("fulfillment_status='completed'");expect(f.write).toHaveBeenCalledTimes(3);});
 it('repeated confirmation is idempotent',async()=>{f.query.mockResolvedValueOnce([{id:1n,fulfillment_status:'completed'}]);expect(await confirmCjOrderReceipt(1n,2n)).toEqual({ok:true,alreadyCompleted:true});expect(f.write).not.toHaveBeenCalled();});
});
