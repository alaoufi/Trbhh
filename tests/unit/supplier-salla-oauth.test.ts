import {describe,it,expect,vi} from 'vitest';
import {authorizationUrl,exchangeCode,refreshGrant,merchantIdentity,merchantStoreIdentity,assertMerchantStoreMatches} from '@/lib/suppliers/salla-oauth';
import {supplierConfig} from '@/lib/suppliers/config';
const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SALLA_CLIENT_ID:'test-id',SALLA_CLIENT_SECRET:'test-secret',SUPPLIER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32)});
describe('Salla custom OAuth transport',()=>{
 it('builds explicit callback and offline grant without a secret',()=>{const url=new URL(authorizationUrl(config,'a'.repeat(64)));expect(url.origin).toBe('https://accounts.salla.sa');expect(url.searchParams.get('redirect_uri')).toBe('https://trbhh.sa/api/integrations/salla/callback');expect(url.searchParams.get('scope')).toContain('offline_access');expect(url.href).not.toContain('test-secret');});
 it('exchanges code using a form and does not follow redirects',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_in:3600,token_type:'Bearer'})));const result=await exchangeCode(config,'code',fetcher);expect(result.expiresIn).toBe(3600);expect(fetcher.mock.calls[0][0]).toBe('https://accounts.salla.sa/oauth2/token');expect(fetcher.mock.calls[0][1].redirect).toBe('error');expect(fetcher.mock.calls[0][1].body.get('grant_type')).toBe('authorization_code');});
 it('refreshes once and suppresses provider errors',async()=>{const fetcher=vi.fn().mockRejectedValue(new Error('secret-provider-response'));await expect(refreshGrant(config,'refresh',fetcher)).rejects.toThrow('salla_token_request_failed');expect(fetcher).toHaveBeenCalledTimes(1);});
 it('rejects incomplete grants',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'access',expires_in:3600})));await expect(exchangeCode(config,'code',fetcher)).rejects.toThrow('salla_token_response_invalid');});
 it('uses merchant id rather than employee id',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{id:999,merchant:{id:123,name:'Store',domain:'https://store.example'}}})));expect(await merchantIdentity('access',fetcher)).toBe('123');});
 it('binds the authenticated merchant to the exact onboarded store URL',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{id:999,merchant:{id:123,name:'شعبيات الأولين',domain:'https://shabiat24.com/'}}})));
  const merchant=await merchantStoreIdentity('access',fetcher);
  expect(merchant).toEqual({id:'123',name:'شعبيات الأولين',domain:'https://shabiat24.com'});
  expect(()=>assertMerchantStoreMatches(merchant,'123','https://shabiat24.com')).not.toThrow();
 });
 it.each([
  [{id:'123',name:'متجر تجريبي',domain:'https://demostore.salla.sa/dev-store'},'123','https://shabiat24.com'],
  [{id:'123',name:'شعبيات الأولين',domain:'https://other.example'},'123','https://shabiat24.com'],
  [{id:'999',name:'شعبيات الأولين',domain:'https://shabiat24.com'},'123','https://shabiat24.com'],
 ])('rejects a demo, foreign-domain, or foreign-id merchant before catalog import',(merchant,id,url)=>{
  expect(()=>assertMerchantStoreMatches(merchant,id,url)).toThrow('supplier_merchant_identity_mismatch');
 });
});
