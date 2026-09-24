import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({session:vi.fn(),access:vi.fn(),quote:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:mocks.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:mocks.access}));
vi.mock('@/lib/cj/trial-quote',()=>({quoteCjTrialCart:mocks.quote}));
import {POST} from '@/app/api/cj/trial-cart/route';

const origin='https://trbhh.sa';
const quote={currency:'SAR',lines:[{id:1,title:'منتج تجريبي',image:'/image.png',unitMinor:5525,currency:'SAR',qty:2,totalMinor:11050}],totalMinor:11050,rejected:[]};
function request(body:unknown={items:[{id:1,qty:2}]},headers:Record<string,string>={}){
  return new Request(origin+'/api/cj/trial-cart',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
}
async function denied(req:Request,status:number,error:string){
  const response=await POST(req);
  expect(response.status).toBe(status);expect(await response.json()).toEqual({error});
  expect(mocks.quote).not.toHaveBeenCalled();
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','production');mocks.session.mockResolvedValue({uid:9});mocks.access.mockResolvedValue(true);mocks.quote.mockResolvedValue(quote);});
afterEach(()=>vi.unstubAllEnvs());

describe('CJ trial cart HTTP trust boundary',()=>{
  it('returns only the server quote with private no-store caching after fresh access checks',async()=>{
    const response=await POST(request());
    expect(response.status).toBe(200);expect(await response.json()).toEqual(quote);
    expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.session).toHaveBeenCalledOnce();expect(mocks.access).toHaveBeenCalledWith(9,'products','view');
    expect(mocks.quote).toHaveBeenCalledExactlyOnceWith([{id:1,qty:2}]);
  });
  it('requires authentication even when a cart contains valid product IDs',async()=>{
    mocks.session.mockResolvedValue(null);await denied(request(),401,'unauthorized');expect(mocks.access).not.toHaveBeenCalled();
  });
  it('requires products:view independently of any other staff or public storefront status',async()=>{
    mocks.access.mockResolvedValue(false);await denied(request(),403,'forbidden');
  });
  it.each(['https://other.example','https://trbhh.sa.evil.example','null','http://trbhh.sa','not an origin','https://trbhh.sa/','https://trbhh.sa/path','https://user@trbhh.sa','https://trbhh.sa, https://other.example'])('rejects untrusted Origin %s',async value=>{
    await denied(request(undefined,{Origin:value}),403,'forbidden');
  });
  it('rejects a missing Origin and does not trust forwarded headers',async()=>{
    const req=request(undefined,{'X-Forwarded-Host':'trbhh.sa','X-Forwarded-Proto':'https'});req.headers.delete('origin');await denied(req,403,'forbidden');
  });
  it.each(['cross-site','same-site','none'])('rejects Sec-Fetch-Site %s even with a matching Origin',async value=>{
    await denied(request(undefined,{'Sec-Fetch-Site':value}),403,'forbidden');
  });
  it('allows omitted browser metadata when the required Origin and session are valid',async()=>{
    const req=request();req.headers.delete('sec-fetch-site');expect((await POST(req)).status).toBe(200);
  });
  it('accepts the canonical browser origin behind the production standalone bind host',async()=>{
    const req=new Request('https://0.0.0.0:3000/api/cj/trial-cart',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    expect((await POST(req)).status).toBe(200);
    expect(mocks.quote).toHaveBeenCalledExactlyOnceWith([{id:1,qty:2}]);
  });
  it('rejects an attacker origin even when request and spoofed proxy headers appear to match',async()=>{
    const req=new Request('https://attacker.example/api/cj/trial-cart',{method:'POST',headers:{Origin:'https://attacker.example',Host:'trbhh.sa','X-Forwarded-Host':'trbhh.sa','X-Forwarded-Proto':'https','Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    await denied(req,403,'forbidden');
  });
  it.each(['http://localhost:3000','http://127.0.0.1:4325','https://[::1]:3000'])('rejects loopback origin %s in production',async local=>{
    const req=new Request(local+'/api/cj/trial-cart',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    await denied(req,403,'forbidden');
  });
  it.each(['http://localhost:3000','https://localhost:3000','http://127.0.0.1:4325','https://127.0.0.1:4325','http://[::1]:3000','https://[::1]:3000'])('allows an exact loopback origin %s only in nonproduction',async local=>{
    vi.stubEnv('NODE_ENV','development');
    const req=new Request(local+'/api/cj/trial-cart',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    expect((await POST(req)).status).toBe(200);
  });
  it.each(['http://0.0.0.0:3000','http://192.168.1.10:3000','http://localhost.attacker.example:3000','https://preview.example'])('does not trust matching nonloopback development origin %s',async local=>{
    vi.stubEnv('NODE_ENV','development');
    const req=new Request(local+'/api/cj/trial-cart',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    await denied(req,403,'forbidden');
  });
  it('requires the exact local request origin rather than a different loopback host or port',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const req=new Request('http://127.0.0.1:4325/api/cj/trial-cart',{method:'POST',headers:{Origin:'http://127.0.0.1:4326','Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,qty:2}]})});
    await denied(req,403,'forbidden');
  });
  it.each(['text/plain','application/x-www-form-urlencoded','multipart/form-data'])('rejects non-JSON content type %s',async type=>{
    await denied(request(undefined,{'Content-Type':type}),415,'json_required');
  });
  it('rejects malformed JSON without exposing parsing diagnostics',async()=>{
    const req=new Request(origin+'/api/cj/trial-cart',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"private":"unterminated'});
    await denied(req,400,'invalid_cart');
  });
  it.each([
    null,[],{}, {items:'1'}, {items:[null]}, {items:[{id:1,qty:2}],price:1},
    {items:[{id:1,qty:2,unitMinor:1}]}, {items:[{id:1,qty:2,price:1}]}, {items:[{id:'1',qty:2}]},
    {items:[{id:0,qty:2}]}, {items:[{id:-1,qty:2}]}, {items:[{id:1.5,qty:2}]},
    {items:[{id:1,qty:0}]}, {items:[{id:1,qty:-2}]}, {items:[{id:1,qty:1.5}]}, {items:[{id:1,qty:'2'}]},
  ])('rejects malformed or spoofed cart %# before quote resolution',async body=>{await denied(request(body),400,'invalid_cart');});
  it('accepts an empty cart after the final item is removed',async()=>{
    const empty={currency:'SAR',lines:[],totalMinor:0,rejected:[]};mocks.quote.mockResolvedValue(empty);
    const response=await POST(request({items:[]}));expect(response.status).toBe(200);expect(await response.json()).toEqual(empty);expect(mocks.quote).toHaveBeenCalledExactlyOnceWith([]);
  });
  it('rejects an oversized declared length before reading a small body',async()=>{
    await denied(request(undefined,{'Content-Length':'8193'}),413,'body_too_large');
  });
  it('bounds streamed bytes without Content-Length and cancels further consumption',async()=>{
    const cancel=vi.fn();let chunks=0;
    const body=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new TextEncoder().encode(chunks++===0?' {"items":[{"id":1,"qty":2}]}':' '.repeat(1024)));},cancel});
    const req=new Request(origin+'/api/cj/trial-cart',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body,duplex:'half'} as RequestInit&{duplex:'half'});
    await denied(req,413,'body_too_large');expect(cancel).toHaveBeenCalledOnce();
  });
  it('enforces the byte cap for multibyte input rather than counting characters',async()=>{
    await denied(request({items:[{id:1,qty:2}],extra:'ا'.repeat(4100)}),413,'body_too_large');
  });
  it('accepts a valid body at the exact byte limit',async()=>{
    const json=JSON.stringify({items:[{id:1,qty:2}]});
    const req=new Request(origin+'/api/cj/trial-cart',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:json+' '.repeat(8192-json.length)});
    expect((await POST(req)).status).toBe(200);
  });
  it('returns the safe invalid-total error without provider or database details',async()=>{
    mocks.quote.mockRejectedValue(Error('invalid_total'));
    const response=await POST(request());expect(response.status).toBe(422);expect(await response.json()).toEqual({error:'invalid_total'});
  });
  it('sanitizes unexpected quotation failures',async()=>{
    mocks.quote.mockRejectedValue(Error('private SQL and CJ credential details'));
    const response=await POST(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'unavailable'});
  });
});
