import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn(),update:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mock.query,$executeRaw:mock.update}}));
vi.mock('@/lib/cj/fulfillment',()=>({processCjFulfillment:mock.process}));
import {POST} from '@/app/api/internal/cj/fulfill-orders/route';
const secret='fixture-cj-reconcile-secret-at-least-32';
const req=(authorization=`Bearer ${secret}`)=>new Request('https://trbhh.sa/api/internal/cj/fulfill-orders',{method:'POST',headers:{authorization}});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_RECONCILE_SECRET',secret);vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED','true');mock.query.mockResolvedValue([{id:7n}]);mock.process.mockResolvedValue(undefined);mock.update.mockResolvedValue(1);});
describe('authenticated bounded CJ fulfillment dispatch',()=>{
 it('rejects unauthenticated requests before DB or supplier access',async()=>{expect((await POST(req('Bearer wrong'))).status).toBe(401);expect(mock.query).not.toHaveBeenCalled();expect(mock.process).not.toHaveBeenCalled();});
 it('does not run when the dedicated live worker gate is disabled',async()=>{vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED','false');expect((await POST(req())).status).toBe(503);expect(mock.query).not.toHaveBeenCalled();});
 it('dispatches one durable id and exposes only aggregate result',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(await r.json()).toEqual({processed:1});expect(mock.process).toHaveBeenCalledExactlyOnceWith('7');expect(String(mock.query.mock.calls[0][0])).toContain('LIMIT 1');});
 it('includes interrupted durable claims and rotates attempted work fairly',async()=>{await POST(req());const sql=String(mock.query.mock.calls[0][0]);expect(sql).toContain('creating');expect(sql).toContain('debit_claimed');expect(sql).toContain('ORDER BY updated_at ASC,id ASC');expect(mock.update).toHaveBeenCalled();});
 it('failure never reports successful processing or private supplier errors',async()=>{mock.process.mockRejectedValue(Error('private-address-or-token'));const r=await POST(req());expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'cj_fulfillment_unavailable'});});
});