import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn(),update:vi.fn(),reconcile:vi.fn(),sync:vi.fn()}));
vi.mock('@/lib/cj/settlements',()=>({reconcileCjSettlementForFulfillment:mock.sync}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mock.query,$executeRaw:mock.update}}));
vi.mock('@/lib/cj/fulfillment/status',()=>({reconcileCjFulfillment:mock.reconcile}));
import {POST} from '@/app/api/internal/cj/fulfillment-status/route';
const secret='fixture-cj-status-secret-at-least-32';
const req=(authorization=`Bearer ${secret}`)=>new Request('https://trbhh.sa/api/internal/cj/fulfillment-status',{method:'POST',headers:{authorization}});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_RECONCILE_SECRET',secret);vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED','false');mock.query.mockResolvedValue([{id:8n}]);mock.reconcile.mockResolvedValue(undefined);mock.update.mockResolvedValue(1);});
describe('read-only CJ fulfillment status dispatcher',()=>{
 it('refreshes batch accounting from supplier proof while purchasing is disabled',async()=>{await POST(req());expect(mock.sync).toHaveBeenCalledExactlyOnceWith('8');expect(mock.sync.mock.invocationCallOrder[0]).toBeGreaterThan(mock.reconcile.mock.invocationCallOrder[0]);});
 it('rejects invalid bearer before any supplier access',async()=>{expect((await POST(req('Bearer wrong'))).status).toBe(401);expect(mock.query).not.toHaveBeenCalled();expect(mock.reconcile).not.toHaveBeenCalled();});
 it('keeps paid order tracking available while new purchasing is disabled',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(await r.json()).toEqual({checked:1});expect(mock.reconcile).toHaveBeenCalledExactlyOnceWith('8');expect(String(mock.query.mock.calls[0][0])).toContain("status='supplier_paid'");});
 it('rotates a failed oldest status attempt so a later paid shipment is checked',async()=>{let rotated=false;mock.query.mockImplementation(async()=>[{id:rotated?9n:8n}]);mock.update.mockImplementation(async()=>{rotated=true;return 1;});mock.reconcile.mockImplementation(async(id:string)=>{if(id==='8')throw Error('provider_unavailable');});expect((await POST(req())).status).toBe(503);expect((await POST(req())).status).toBe(200);expect(mock.reconcile.mock.calls.map(c=>c[0])).toEqual(['8','9']);});
 it('returns an unavailable error on failed read without inventing shipment success',async()=>{mock.reconcile.mockRejectedValue(Error('private customer detail'));const r=await POST(req());expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'cj_status_unavailable'});});
});
