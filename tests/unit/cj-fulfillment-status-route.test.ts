import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn(),update:vi.fn(),reconcile:vi.fn(),payment:vi.fn(),sync:vi.fn(),batch:vi.fn()}));
vi.mock('@/lib/cj/settlements',()=>({reconcileCjSettlementForFulfillment:mock.sync}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mock.query,$executeRaw:mock.update}}));
vi.mock('@/lib/cj/fulfillment/status',()=>({reconcileCjFulfillment:mock.reconcile}));
vi.mock('@/lib/cj/fulfillment',()=>({reconcileCjFulfillmentPayment:mock.payment}));
vi.mock('@/lib/cj/client',()=>({getCjOrderDetailBatch:mock.batch}));
import {POST} from '@/app/api/internal/cj/fulfillment-status/route';
const secret='fixture-cj-status-secret-at-least-32';
const req=(authorization=`Bearer ${secret}`)=>new Request('https://trbhh.sa/api/internal/cj/fulfillment-status',{method:'POST',headers:{authorization}});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SUPPLIER_RECONCILE_SECRET',secret);vi.stubEnv('CJ_ALLOW_LIVE_ORDERS','false');mock.query.mockResolvedValue([{id:8n,cj_order_id:'CJ8',supplier_reference:'REF8'}]);mock.batch.mockResolvedValue({ok:true,data:[{orderId:'CJ8',orderNum:'REF8',paymentDate:'2026-10-15 10:00:00'}]});mock.update.mockResolvedValue(1);});
describe('CJ periodic authenticated batch reconciliation',()=>{
 it('refreshes payments, shipments and accounting while new purchases are disabled',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(await r.json()).toEqual({checked:1,ordersChecked:1});expect(mock.batch).toHaveBeenCalledExactlyOnceWith(['CJ8']);expect(mock.payment).toHaveBeenCalledWith('8',expect.objectContaining({orderId:'CJ8'}));expect(mock.sync).toHaveBeenCalledWith('8');expect(mock.sync.mock.invocationCallOrder[0]).toBeGreaterThan(mock.payment.mock.invocationCallOrder[0]);});
 it('rejects invalid bearer before DB or API reads',async()=>{expect((await POST(req('Bearer wrong'))).status).toBe(401);expect(mock.query).not.toHaveBeenCalled();});
 it('never accepts missing or wrong-reference batch members as verified',async()=>{mock.batch.mockResolvedValue({ok:true,data:[{orderId:'CJ8',orderNum:'WRONG'}]});expect((await POST(req())).status).toBe(503);expect(mock.payment).not.toHaveBeenCalled();expect(mock.sync).not.toHaveBeenCalled();});
 it('continues later members after one fails without claiming complete reconciliation',async()=>{mock.query.mockResolvedValue([{id:8n,cj_order_id:'CJ8',supplier_reference:'REF8'},{id:9n,cj_order_id:'CJ9',supplier_reference:'REF9'}]);mock.batch.mockResolvedValue({ok:true,data:[{orderId:'CJ8',orderNum:'REF8'},{orderId:'CJ9',orderNum:'REF9'}]});mock.payment.mockRejectedValueOnce(Error('unavailable'));expect((await POST(req())).status).toBe(503);expect(mock.payment).toHaveBeenCalledTimes(2);expect(mock.sync).toHaveBeenCalledWith('9');expect(mock.update).toHaveBeenCalledTimes(2);});
 it('rotates work before API failure so one missing order cannot monopolize polling',async()=>{mock.batch.mockResolvedValue({ok:false});expect((await POST(req())).status).toBe(503);expect(mock.update.mock.invocationCallOrder[0]).toBeLessThan(mock.batch.mock.invocationCallOrder[0]);});
});