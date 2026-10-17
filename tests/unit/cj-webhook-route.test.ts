import {createHmac} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({write:vi.fn(),query:vi.fn(),after:vi.fn(),payment:vi.fn(),status:vi.fn(),batch:vi.fn(),legacy:vi.fn(),processed:vi.fn()}));
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:f.after}));
vi.mock('@/lib/cj/config',()=>({cjConfig:()=>({webhookSecret:''})}));
vi.mock('@/lib/prisma',()=>({prisma:{$executeRaw:f.write,$queryRaw:f.query,cj_webhook_events:{updateMany:f.processed}}}));
vi.mock('@/lib/cj/fulfillment',()=>({reconcileCjFulfillmentPayment:f.payment}));
vi.mock('@/lib/cj/fulfillment/status',()=>({reconcileCjFulfillment:f.status}));
vi.mock('@/lib/cj/settlements',()=>({reconcileCjSettlementForFulfillment:f.batch}));
vi.mock('@/lib/cj/orders/sync-status',async original=>({...await original<typeof import('@/lib/cj/orders/sync-status')>(),applyCjWebhookEvent:f.legacy}));
import {POST} from '@/app/api/integrations/cj/webhooks/route';
function request(value:unknown,valid=true){const raw=JSON.stringify(value),sign=valid?createHmac('sha256','123456').update(raw).digest('base64'):'invalid';return new Request('https://trbhh.sa/api/integrations/cj/webhooks',{method:'POST',headers:{sign},body:raw}) as never;}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CJ_WEBHOOK_OPEN_ID','123456');f.write.mockResolvedValue(1);f.query.mockResolvedValue([{id:8n}]);f.legacy.mockResolvedValue({matched:false});});
afterEach(()=>vi.unstubAllEnvs());
describe('CJ signed durable webhook receiver',()=>{
 it('rejects chunked overflow and cancels before authentication or storage',async()=>{const cancel=vi.fn();let part=0;const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(Buffer.alloc(part++?1:1_048_576));},cancel});const response=await POST({headers:new Headers({'content-length':'1'}),body} as never);expect(response.status).toBe(413);expect(cancel).toHaveBeenCalledOnce();expect(f.write).not.toHaveBeenCalled();expect(f.after).not.toHaveBeenCalled();});
 it('acknowledges a duplicate without scheduling another mutation',async()=>{f.write.mockResolvedValue(0);expect((await POST(request({messageId:'REPLAY'}))).status).toBe(200);expect(f.after).not.toHaveBeenCalled();});
 it('rejects an invalid sign before storage or any supplier call',async()=>{expect((await POST(request({},false))).status).toBe(401);expect(f.write).not.toHaveBeenCalled();expect(f.after).not.toHaveBeenCalled();});
 it('persists and acknowledges before supplier reads; paymentDate in a payload never marks paid',async()=>{const r=await POST(request({messageId:'M1',type:'Order',params:{orderId:'CJ8',orderNumber:'REF8',paymentDate:'2099-01-01',status:'DELIVERED'}}));expect(r.status).toBe(200);expect(f.payment).not.toHaveBeenCalled();expect(f.after).toHaveBeenCalledTimes(1);await f.after.mock.calls[0][0]();expect(f.payment).toHaveBeenCalledExactlyOnceWith('8');expect(f.status).toHaveBeenCalledExactlyOnceWith('8');expect(f.write).toHaveBeenCalledTimes(1);expect(String(f.write.mock.calls[0][0])).toContain('INSERT INTO cj_webhook_events');});
 it('does not acknowledge a lost database write as success',async()=>{f.write.mockRejectedValue(Error('offline'));expect((await POST(request({messageId:'M1'}))).status).toBe(503);expect(f.after).not.toHaveBeenCalled();});
 it.each([null,[]])('rejects a non-object envelope',async payload=>{expect((await POST(request(payload))).status).toBe(400);expect(f.write).not.toHaveBeenCalled();});
});
