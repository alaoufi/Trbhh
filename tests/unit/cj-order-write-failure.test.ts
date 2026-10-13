import {describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({cj_orders:{findUnique:vi.fn(),update:vi.fn()},cj_order_events:{createMany:vi.fn()}}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
db.cj_order_events.createMany.mockResolvedValue({count:1});
import {transitionOrder,setOrderTracking} from '@/lib/cj/orders/store';
describe('order persistence does not acknowledge failed writes',()=>{
 it('fails transition when database update fails',async()=>{db.cj_orders.findUnique.mockResolvedValue({id:1n,status:'sent_to_cj',internal_ref:'r'});db.cj_orders.update.mockRejectedValue(Error('database down'));await expect(transitionOrder(1,'preparing')).rejects.toThrow('database down');});
 it('fails tracking when database update fails',async()=>{db.cj_orders.update.mockRejectedValue(Error('database down'));await expect(setOrderTracking(1,{trackingNumber:'x'})).rejects.toThrow('database down');});
});
