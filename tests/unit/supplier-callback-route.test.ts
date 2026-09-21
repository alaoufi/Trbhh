import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({session:vi.fn(),permission:vi.fn(),cookie:vi.fn(),complete:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/roles',()=>({hasAction:state.permission}));
vi.mock('next/headers',()=>({cookies:async()=>({get:state.cookie})}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/connections',()=>({completeOAuth:state.complete}));
import {GET} from '@/app/api/integrations/salla/callback/route';
const request=(query='state=state-value&code=code-value')=>new NextRequest(`https://untrusted-host.example/api/integrations/salla/callback?${query}`);
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SUPPLIER_PUBLIC_ORIGIN','https://configured.example');state.session.mockResolvedValue({uid:7});state.permission.mockResolvedValue(true);state.cookie.mockImplementation((name:string)=>name==='salla_oauth_browser'?{value:'browser-value'}:undefined);state.complete.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
describe('Salla callback route boundary',()=>{
 it('rejects guests before permission/cookie/exchange',async()=>{
  state.session.mockResolvedValue(null);expect((await GET(request())).status).toBe(403);expect(state.permission).not.toHaveBeenCalled();expect(state.complete).not.toHaveBeenCalled();
 });
 it('requires supplier edit permission',async()=>{
  state.permission.mockResolvedValue(false);expect((await GET(request())).status).toBe(403);expect(state.permission).toHaveBeenCalledWith(7,'suppliers','edit');expect(state.complete).not.toHaveBeenCalled();
 });
 it('passes server admin/browser identity and redirects only to configured origin',async()=>{
  const response=await GET(request());expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('https://configured.example/admin/suppliers/integrations?result=connected');
  expect(state.complete).toHaveBeenCalledWith(expect.anything(),{state:'state-value',code:'code-value',browser:'browser-value',adminId:7n},expect.objectContaining({origin:'https://configured.example'}));
  expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  const cookie=response.headers.get('set-cookie')||'';expect(cookie).toContain('Max-Age=0');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('Path=/api/integrations/salla/callback');
 });
 it('provider denial never exchanges or reflects its payload',async()=>{
  const response=await GET(request('error=secret-provider-message&error_description=private'));
  expect(response.headers.get('location')).toBe('https://configured.example/admin/suppliers/integrations?result=connection_failed');expect(state.complete).not.toHaveBeenCalled();expect(await response.text()).not.toContain('private');
 });
 it('exchange errors are sanitized and cookie cleared',async()=>{
  state.complete.mockRejectedValue(new Error('access_token=secret'));const response=await GET(request());expect(response.headers.get('location')).toContain('result=connection_failed');expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect(await response.text()).not.toContain('secret');
 });
 it('missing browser proof is forwarded empty, not taken from query',async()=>{
  state.cookie.mockReturnValue(undefined);state.complete.mockRejectedValue(new Error('supplier_oauth_state'));
  const response=await GET(request('state=s&code=c&browser=forged&adminId=99'));expect(response.headers.get('location')).toContain('connection_failed');expect(state.complete.mock.calls[0][1]).toMatchObject({browser:'',adminId:7n});
 });
 it('fails closed on invalid configured origin',async()=>{
  vi.stubEnv('SUPPLIER_PUBLIC_ORIGIN','https://user:pass@example.com');expect((await GET(request())).status).toBe(503);expect(state.complete).not.toHaveBeenCalled();
 });
});
