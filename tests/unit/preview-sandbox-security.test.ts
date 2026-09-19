import {afterEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../../src/middleware';
import {readBoundedPreviewJson} from '../../src/lib/preview-request';
afterEach(()=>vi.unstubAllEnvs());
describe('sandbox request boundaries',()=>{
  it('denies every server action including login route forwarding and multipart actions',()=>{
    vi.stubEnv('PREVIEW_SANDBOX','true');
    for(const path of ['/login','/preview-login','/api/preview-login','/api/preview-state','/ads/new']) {
      const response=middleware(new NextRequest('https://preview.example.test'+path,{method:'POST',headers:{'next-action':'non-login-action'}}));
      expect(response.status).toBe(405);
    }
    const form=new FormData();form.set('$ACTION_ID_arbitrary','');
    expect(middleware(new NextRequest('https://preview.example.test/login',{method:'POST',body:form})).status).toBe(405);
  });
  it('redirects only GET login to dedicated sandbox authentication',()=>{
    vi.stubEnv('PREVIEW_SANDBOX','true');
    expect(middleware(new NextRequest('https://preview.example.test/login?next=%2Fseller')).headers.get('location')).toBe('https://preview.example.test/preview-login?next=%2Fseller');
  });
  it('bounds streaming input even without a Content-Length header',async()=>{
    const request=new Request('https://preview.example.test',{method:'POST',body:'{"large":"123456789"}'});
    await expect(readBoundedPreviewJson(request,8)).rejects.toThrow(RangeError);
    await expect(readBoundedPreviewJson(new Request('https://preview.example.test',{method:'POST',body:'{"ok":true}'}),20)).resolves.toEqual({ok:true});
  });
});
