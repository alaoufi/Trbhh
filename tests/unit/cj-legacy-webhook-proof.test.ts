import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({findFirst:vi.fn(),findUnique:vi.fn(),detail:vi.fn(),status:vi.fn(),tracking:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_orders:{findFirst:f.findFirst,findUnique:f.findUnique}}}));
vi.mock('@/lib/cj/client',()=>({getCjOrderDetail:f.detail,getTracking:vi.fn()}));
vi.mock('@/lib/cj/orders/store',()=>({applyCjStatus:f.status,setOrderTracking:f.tracking}));
import {applyCjWebhookEvent} from '@/lib/cj/orders/sync-status';
const event={eventKey:'e',cjOrderId:'CJ1',orderNumber:'R1',rawStatus:'COMPLETED',trackNumber:'FAKE'};
beforeEach(()=>{vi.resetAllMocks();f.findFirst.mockResolvedValue({id:1n,internal_ref:'R1',cj_order_id:'CJ1',status:'sent_to_cj'});f.status.mockResolvedValue({ok:true});});
describe('legacy webhook proof boundary',()=>{
 it('uses current authenticated detail instead of notification delivery and tracking claims',async()=>{f.detail.mockResolvedValue({ok:true,data:{proof:{orderId:'CJ1',orderNum:'R1',isSandbox:0,orderStatus:'PROCESSING',trackNumber:'CURRENT'}}});await applyCjWebhookEvent(event);expect(f.detail).toHaveBeenCalledWith('CJ1');expect(f.status).toHaveBeenCalledWith(1n,'PROCESSING',expect.anything());expect(f.tracking).toHaveBeenCalledWith(1n,expect.objectContaining({trackingNumber:'CURRENT'}),expect.anything());});
 it.each([1,'1',true,undefined])('does not accept sandbox or absent live proof %s',async isSandbox=>{f.detail.mockResolvedValue({ok:true,data:{proof:{orderId:'CJ1',orderNum:'R1',isSandbox,orderStatus:'COMPLETED'}}});await applyCjWebhookEvent(event);expect(f.status).not.toHaveBeenCalled();expect(f.tracking).not.toHaveBeenCalled();});
 it('does not fall back from a conflicting CJ ID to a real reference',async()=>{f.findFirst.mockResolvedValue(null);f.findUnique.mockResolvedValue({id:1n,internal_ref:'R1',cj_order_id:'LIVE'});await applyCjWebhookEvent(event);expect(f.detail).not.toHaveBeenCalled();expect(f.status).not.toHaveBeenCalled();});
 it('rejects a source reference mismatch',async()=>{f.detail.mockResolvedValue({ok:true,data:{proof:{orderId:'CJ1',orderNum:'OTHER',isSandbox:0,orderStatus:'COMPLETED'}}});await applyCjWebhookEvent(event);expect(f.status).not.toHaveBeenCalled();});
});
