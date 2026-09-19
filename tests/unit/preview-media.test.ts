import { afterEach, describe, it, expect, vi } from 'vitest';
import { previewMediaUrl, fetchPreviewMedia } from '../../src/lib/preview-media';
afterEach(()=>vi.unstubAllGlobals());
describe('preview public media target', () => {
 it('retains public ad audio without forwarding credentials', async()=>{
  for(const [extension,mime] of [['mp3','audio/mpeg'],['m4a','audio/mp4'],['ogg','audio/ogg'],['wav','audio/wav']]) {
   vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('audio-fixture',{headers:{'content-type':mime}})));
   const result=await fetchPreviewMedia(['uploads',`ad.${extension}`]);
   expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe(mime);
  }
 });
 it('pins image requests to the original public origin', () => {
  expect(previewMediaUrl(['uploads','public-ad.jpg'])).toBe('https://trbhh.sa/media/uploads/public-ad.jpg');
 });
 it('never forwards credentials and refuses upstream redirects or non-media', async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://other.example/image.jpg'}})).mockResolvedValueOnce(new Response('private',{headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',fetcher);
  expect((await fetchPreviewMedia(['a.jpg'])).status).toBe(404);
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'manual',cache:'no-store'});
  expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  expect((await fetchPreviewMedia(['a.jpg'])).status).toBe(404);
 });
 it('rejects traversal, encoded paths, remote URLs and non media', () => {
  for(const parts of [['..','secret.jpg'],['%2e%2e','x.jpg'],['https:','x.jpg'],['a\\b.jpg'],['document.pdf'],['x.svg'],['x.html'],[]]) expect(previewMediaUrl(parts)).toBeNull();
 });
});
