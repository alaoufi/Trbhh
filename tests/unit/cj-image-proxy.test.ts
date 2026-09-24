import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {GET} from '@/app/api/cj/img/route';

const host='cc-west-usa.oss-us-west-1.aliyuncs.com';
const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0,0xff,0xd9]);
const fetchImage=vi.fn();
const request=(url=`https://${host}/product.jpg`)=>new Request('https://trbhh.test/api/cj/img?u='+encodeURIComponent(url));
const upstream=(body:BodyInit=jpeg,type='image/jpeg',headers:Record<string,string>={})=>new Response(body,{headers:{'Content-Type':type,...headers}});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetchImage);fetchImage.mockResolvedValue(upstream());});
afterEach(()=>vi.unstubAllGlobals());
function protectedResponse(response:Response){
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
}

describe('CJ raster image proxy security',()=>{
  it.each([host,'cf.cjdropshipping.com','oss-cf.cjdropshipping.com'])('serves verified raster bytes only from explicit CDN %s',async hostname=>{
    const response=await GET(request(`https://${hostname}/product.jpg`));
    expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');protectedResponse(response);
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
  });
  it.each(['image/jpg','IMAGE/JPG; charset=binary'])('normalizes CJ JPEG alias %s after verifying the bytes',async type=>{
    fetchImage.mockResolvedValue(upstream(jpeg,type));
    const response=await GET(request('https://cf.cjdropshipping.com/quick/product/fixture.jpg'));
    expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');protectedResponse(response);
    expect(fetchImage.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
  });
  it.each(['<svg xmlns="http://www.w3.org/2000/svg"/>','<!doctype html><script>alert(1)</script>'])('rejects active content disguised as image/jpg: %s',async body=>{
    fetchImage.mockResolvedValue(upstream(body,'image/jpg'));
    const response=await GET(request());expect(response.status).toBe(415);
    expect(response.headers.get('Cache-Control')).toBe('no-store');protectedResponse(response);
  });
  it.each([
    'https://attacker-bucket.oss-us-west-1.aliyuncs.com/active.svg',
    'https://aliyuncs.com/image.jpg','https://unreviewed.cjdropshipping.com/image.jpg',
    `https://${host}.evil.test/image.jpg`,`https://evil.${host}/image.jpg`,
    `https://user:password@${host}/image.jpg`,`https://${host}:8443/image.jpg`,
    'https://127.0.0.1/image.jpg','https://169.254.169.254/latest/meta-data/',
    'https://[::1]/image.jpg',`http://${host}/image.jpg`,
  ])('rejects an untrusted destination before making any request: %s',async url=>{
    const response=await GET(request(url));expect(response.status).toBe(403);
    expect(fetchImage).not.toHaveBeenCalled();protectedResponse(response);
  });
  it('rejects malformed URLs with protected, uncached error responses',async()=>{
    const response=await GET(request('not a url'));expect(response.status).toBe(400);
    expect(fetchImage).not.toHaveBeenCalled();expect(response.headers.get('Cache-Control')).toBe('no-store');protectedResponse(response);
  });
  it.each(['image/svg+xml','image/svg+xml; charset=utf-8','text/html','application/octet-stream'])('rejects active or unrecognized MIME %s',async type=>{
    fetchImage.mockResolvedValue(upstream('<svg xmlns="http://www.w3.org/2000/svg"><script>document.cookie</script></svg>',type));
    const response=await GET(request());expect(response.status).toBe(415);protectedResponse(response);
  });
  it('rejects SVG disguised as a permitted raster MIME',async()=>{
    fetchImage.mockResolvedValue(upstream('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect((await GET(request())).status).toBe(415);
  });
  it('does not infer a safe MIME when the upstream omits Content-Type',async()=>{
    fetchImage.mockResolvedValue(new Response(jpeg));expect((await GET(request())).status).toBe(415);
  });
  it.each([301,302,303,307,308])('never follows an upstream %i redirect',async status=>{
    fetchImage.mockResolvedValue(new Response(null,{status,headers:{Location:'http://169.254.169.254/latest/meta-data/'}}));
    expect((await GET(request())).status).toBe(404);expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage.mock.calls[0][1]).toMatchObject({redirect:'error'});
  });
  it.each([
    ['image/png',Uint8Array.from([137,80,78,71,13,10,26,10])],
    ['image/gif',new TextEncoder().encode('GIF89a')],
    ['image/webp',new TextEncoder().encode('RIFF1234WEBP')],
    ['image/avif',Uint8Array.from([0,0,0,24,...new TextEncoder().encode('ftypavif'),0,0,0,0,...new TextEncoder().encode('avifmif1')])],
  ] as const)('preserves supported raster type %s',async(type,bytes)=>{
    fetchImage.mockResolvedValue(upstream(bytes,type));const response=await GET(request());
    expect(response.status).toBe(200);expect(response.headers.get('Content-Type')).toBe(type);protectedResponse(response);
  });
  it('rejects a declared oversized body before reading it',async()=>{
    fetchImage.mockResolvedValue(upstream(jpeg,'image/jpeg',{'Content-Length':String(10*1024*1024+1)}));
    expect((await GET(request())).status).toBe(413);
  });
  it('enforces the byte limit even when Content-Length is absent',async()=>{
    const cancel=vi.fn();let chunk=0;
    const body=new ReadableStream<Uint8Array>({pull(controller){if(chunk===3){controller.close();return;}controller.enqueue(chunk++===1?new Uint8Array(10*1024*1024):jpeg);},cancel});
    fetchImage.mockResolvedValue(upstream(body));expect((await GET(request())).status).toBe(413);expect(cancel).toHaveBeenCalled();
  });
  it('returns a safe response for a failed body stream without exposing upstream errors',async()=>{
    const body=new ReadableStream<Uint8Array>({start(controller){controller.error(Error('private upstream diagnostic'));}});
    fetchImage.mockResolvedValue(upstream(body));const response=await GET(request());
    expect(response.status).toBe(404);expect(await response.text()).not.toContain('private');protectedResponse(response);
  });
});
