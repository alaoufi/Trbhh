import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({query:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:f.query,$executeRaw:f.write})}}));
import {raiseCjDeliveryDispute} from '@/lib/cj/fulfillment/dispute';
beforeEach(()=>vi.resetAllMocks());
describe('customer delivery objection holds',()=>{
 it('rejects non-owned or unpaid orders without any write',async()=>{f.query.mockResolvedValueOnce([]);await expect(raiseCjDeliveryDispute(1n,2n,'Package was not delivered')).rejects.toThrow('unavailable');expect(f.write).not.toHaveBeenCalled();});
 it('records the reason and blocks closure without touching bank or CJ balances',async()=>{f.query.mockResolvedValueOnce([{id:1n}]).mockResolvedValueOnce([{id:8n,evidence_json:{fulfillment:{stage:'delivered'}}}]).mockResolvedValueOnce([]);await raiseCjDeliveryDispute(1n,2n,'Package was not delivered');expect(f.write).toHaveBeenCalledTimes(3);const text=f.write.mock.calls.map(c=>String(c[0]));expect(text.join(' ')).toContain('action_required');expect(text.join(' ')).not.toMatch(/UPDATE commerce_receipts|wallet|payBalance/);expect(String(f.write.mock.calls[0][1])).toContain('CUSTOMER_DISPUTE');});
 it('repeated objection does not duplicate the saved record',async()=>{f.query.mockResolvedValueOnce([{id:1n}]).mockResolvedValueOnce([{id:8n}]).mockResolvedValueOnce([{id:9n}]);await raiseCjDeliveryDispute(1n,2n,'Package was not delivered');expect(f.write).not.toHaveBeenCalled();});
});
