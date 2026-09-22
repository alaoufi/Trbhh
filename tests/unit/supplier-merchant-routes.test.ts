import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({session:vi.fn(),permission:vi.fn(),parse:vi.fn(),context:vi.fn(),start:vi.fn(),issue:vi.fn(),complete:vi.fn(),sync:vi.fn(),failure:vi.fn(),cookie:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:state.permission}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('next/headers',()=>({cookies:async()=>({get:state.cookie})}));
vi.mock('@/lib/suppliers/merchant-oauth',()=>({parseMerchantInvitation:state.parse,parseMerchantContext:state.context,startMerchantOAuth:state.start,issueMerchantInvitation:state.issue}));
vi.mock('@/lib/suppliers/connections',()=>({completeOAuth:state.complete,recordOAuthFailure:state.failure}));
vi.mock('@/lib/suppliers/sync',()=>({syncAuthorizedSupplier:state.sync}));
import {GET as landing,POST as start} from '@/app/api/integrations/salla/authorize/route';
import {POST as issue} from '@/app/api/integrations/salla/invite/route';
import {GET as callback} from '@/app/api/integrations/salla/callback/route';
import {readOAuthForm} from '@/lib/suppliers/oauth-form';
const origin='https://trbhh.sa',csrf='a'.repeat(64);
const formRequest=(path:string,body:string,extra:Record<string,string>={})=>new NextRequest(origin+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`salla_merchant_start=${csrf}`,...extra},body});
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('SUPPLIER_PUBLIC_ORIGIN',origin);
 state.parse.mockReturnValue({supplierId:'2',adminId:'7',expectedName:'شعبيات الأولين'});
 state.context.mockReturnValue({supplierId:'2',adminId:'7',expectedName:'شعبيات الأولين'});
 state.permission.mockResolvedValue(true);state.session.mockResolvedValue(null);
 state.start.mockResolvedValue({url:'https://accounts.salla.sa/oauth2/auth?state=verified',browser:'b'.repeat(64),context:'signed-owner-context'});
 state.issue.mockResolvedValue({url:origin+'/api/integrations/salla/authorize?invite=signed',expiresAt:new Date('2026-09-22T12:00:00Z')});
 state.complete.mockResolvedValue(2n);state.sync.mockResolvedValue({imported:1});state.failure.mockResolvedValue(undefined);
});
afterEach(()=>vi.unstubAllEnvs());
describe('merchant invitation HTTP boundary',()=>{
 it('link previews only display an escaped form; they cannot start or consume OAuth',async()=>{
  state.parse.mockReturnValue({adminId:'7',expectedName:'<script>alert(1)</script>'});
  const response=await landing(new NextRequest(origin+'/api/integrations/salla/authorize?invite=signed'));
  expect(response.status).toBe(200);const html=await response.text();expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(response.headers.get('set-cookie')).toContain('SameSite=strict');
  expect(response.headers.get('referrer-policy')).toBe('strict-origin');expect(response.headers.get('cache-control')).toBe('no-store');expect(state.start).not.toHaveBeenCalled();
 });
 it('rejects expired links without exposing their error or signing material',async()=>{
  state.parse.mockImplementation(()=>{throw Error('private-signing-key');});const response=await landing(new NextRequest(origin+'/api/integrations/salla/authorize?invite=bad'));
  expect(response.status).toBe(400);expect(await response.text()).not.toContain('private-signing-key');
 });
 it('requires same-origin and browser CSRF proof before starting',async()=>{
  expect((await start(formRequest('/api/integrations/salla/authorize',`invite=signed&csrf=${csrf}`,{origin:'https://attacker.example'}))).status).toBe(400);
  expect((await start(formRequest('/api/integrations/salla/authorize','invite=signed&csrf=bad'))).status).toBe(400);
  expect(state.start).not.toHaveBeenCalled();
 });
 it('a revoked issuing admin cannot start an owner authorization',async()=>{
  state.permission.mockResolvedValue(false);expect((await start(formRequest('/api/integrations/salla/authorize',`invite=signed&csrf=${csrf}`))).status).toBe(400);expect(state.start).not.toHaveBeenCalled();
 });
 it('keeps the browser CSRF proof usable when the merchant returns and retries the same form',async()=>{
  const request=()=>formRequest('/api/integrations/salla/authorize',`invite=signed&csrf=${csrf}`);
  const first=await start(request());
  const cookie=first.cookies.get('salla_merchant_start');
  expect(cookie?.maxAge).not.toBe(0);
  expect(cookie?.value??csrf).toBe(csrf);
  const second=await start(request());
  expect(second.status).toBe(303);
  expect(state.start).toHaveBeenCalledTimes(2);
 });
 it('does not invalidate an already open form when its invitation is opened in another tab',async()=>{
  const response=await landing(new NextRequest(origin+'/api/integrations/salla/authorize?invite=signed',{headers:{cookie:`salla_merchant_start=${csrf}`}}));
  expect(response.cookies.get('salla_merchant_start')?.value).toBe(csrf);
  expect(await response.text()).toContain(`name="csrf" value="${csrf}"`);
 });
 it('replaces malformed browser CSRF cookies with a fresh unpredictable proof',async()=>{
  const response=await landing(new NextRequest(origin+'/api/integrations/salla/authorize?invite=signed',{headers:{cookie:'salla_merchant_start=malformed'}}));
  expect(response.cookies.get('salla_merchant_start')?.value).toMatch(/^[a-f0-9]{64}$/);
 });
 it('uses the same fixed callback with HttpOnly browser-bound owner context',async()=>{
  const response=await start(formRequest('/api/integrations/salla/authorize',`invite=signed&csrf=${csrf}`));expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://accounts.salla.sa/oauth2/auth?state=verified');
  expect(response.headers.get('referrer-policy')).toBe('strict-origin');
  const cookies=response.headers.get('set-cookie')||'';expect(cookies).toContain('salla_merchant_context=');expect(cookies).toContain('Path=/api/integrations/salla/callback');expect(cookies).toContain('HttpOnly');expect(cookies).toContain('Secure');
  expect(state.start).toHaveBeenCalledWith({},'signed',expect.objectContaining({origin}));
 });
 it('only a supplier editor can issue a link and admin ID always comes from session',async()=>{
  expect((await issue(formRequest('/api/integrations/salla/invite','supplierId=2&adminId=99'))).status).toBe(403);expect(state.issue).not.toHaveBeenCalled();
  state.session.mockResolvedValue({uid:7});const response=await issue(formRequest('/api/integrations/salla/invite','supplierId=2&adminId=99'));expect(response.status).toBe(200);expect(state.issue).toHaveBeenCalledWith({},2n,7n,expect.anything());
 });
 it('cannot issue invitations through cross-origin POST',async()=>{
  state.session.mockResolvedValue({uid:7});expect((await issue(formRequest('/api/integrations/salla/invite','supplierId=2',{origin:'https://attacker.example'}))).status).toBe(403);expect(state.issue).not.toHaveBeenCalled();
 });
 it('bounds chunked form bodies without trusting Content-Length',async()=>{
  await expect(readOAuthForm(formRequest('/api/integrations/salla/authorize','invite='+'a'.repeat(9000)))).rejects.toThrow('oauth_form_invalid');
 });
});
describe('owner callback independent of admin login',()=>{
 const request=()=>new NextRequest(origin+'/api/integrations/salla/callback?state=verified&code=provider-code');
 beforeEach(()=>state.cookie.mockImplementation((name:string)=>name==='salla_merchant_context'?{value:'signed-context'}:name==='salla_oauth_browser'?{value:'b'.repeat(64)}:undefined));
 it('completes from a guest browser only with signed context and active issuer permission',async()=>{
  const response=await callback(request());expect(response.status).toBe(200);const body=await response.text();expect(body).toContain('تم ربط متجرك');expect(body).toContain('<!doctype html>');expect(response.headers.get('location')).toBeNull();
  expect(state.permission).toHaveBeenCalledWith(7,'integrations','authorize');expect(state.complete).toHaveBeenCalledWith({},expect.objectContaining({adminId:7n,merchantContext:'signed-context',state:'verified'}),expect.anything());
  expect(state.sync).toHaveBeenCalledWith({},2n,expect.anything());
  expect(response.headers.get('set-cookie')).toContain('salla_merchant_context=;');expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
 });
 it('forged or expired context never exchanges a code',async()=>{
  state.context.mockImplementation(()=>{throw Error('invalid');});expect((await callback(request())).status).toBe(403);expect(state.complete).not.toHaveBeenCalled();
 });
 it('revoked issuing permission never exchanges a code',async()=>{
  state.permission.mockResolvedValue(false);expect((await callback(request())).status).toBe(403);expect(state.complete).not.toHaveBeenCalled();
 });
 it('wrong merchant errors are sanitized and do not report Connected',async()=>{
  state.complete.mockRejectedValue(Error('provider-access-token-secret'));const response=await callback(request());expect(response.status).toBe(400);const body=await response.text();expect(body).toContain('لم يكتمل');expect(body).not.toContain('provider-access-token-secret');
  expect(state.failure).toHaveBeenCalledWith({},expect.objectContaining({supplierId:2n,adminId:7n,error:expect.any(Error)}));
 });
 it('keeps authorization successful when initial catalog sync is queued for retry',async()=>{
  state.sync.mockRejectedValue(Error('provider-private-payload'));const response=await callback(request());expect(response.status).toBe(200);const body=await response.text();expect(body).toContain('تم ربط متجرك');expect(body).toContain('المزامنة');expect(body).not.toContain('provider-private-payload');
 });
});
