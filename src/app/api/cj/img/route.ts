import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Explicit image CDNs from CJ's product API examples; never allow arbitrary OSS
// tenants or unrelated provider subdomains. New hosts need an operator review.
// https://developers.cjdropshipping.com/en/api/api2/api/product.html
const ALLOWED_HOSTS = new Set([
  'cc-west-usa.oss-us-west-1.aliyuncs.com',
  'cf.cjdropshipping.com',
  'oss-cf.cjdropshipping.com',
]);
const RASTER_TYPES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif']);
const MAX_BYTES = 10 * 1024 * 1024;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'; base-uri 'none'",
};
const failure = (message:string,status:number) => new NextResponse(message,{status,headers:{...SECURITY_HEADERS,'Cache-Control':'no-store'}});

/** Reject active content mislabeled as a raster type before crossing our origin. */
function matchesRaster(bytes:Buffer,type:string):boolean {
  if(type==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/gif')return ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));
  if(type==='image/webp')return bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(type==='image/avif'){
    if(bytes.length<16||bytes.toString('ascii',4,8)!=='ftyp')return false;
    const size=bytes.readUInt32BE(0);
    if(size<16||size>bytes.length||size%4!==0)return false;
    if(['avif','avis'].includes(bytes.toString('ascii',8,12)))return true;
    for(let offset=16;offset<size;offset+=4)if(['avif','avis'].includes(bytes.toString('ascii',offset,offset+4)))return true;
  }
  return false;
}

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  let target: URL;
  try { target = new URL(u); } catch { return failure('bad_url',400); }
  if (target.protocol!=='https:'||target.username||target.password||target.port||!ALLOWED_HOSTS.has(target.hostname)) return failure('forbidden',403);

  const res = await fetch(target.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cjdropshipping.com/', Accept: [...RASTER_TYPES].join(', ') },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!res) return failure('not_found',404);
  const reject=async(message:string,status:number)=>{await res.body?.cancel().catch(()=>{});return failure(message,status);};
  if(!res.ok||res.redirected)return reject('not_found',404);
  const upstreamType=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  // CJ's quick/product CDN labels JPEG bytes image/jpg; retain the JPEG signature check.
  const ct=upstreamType==='image/jpg'?'image/jpeg':upstreamType;
  if(!RASTER_TYPES.has(ct))return reject('not_image',415);
  if(Number(res.headers.get('content-length'))>MAX_BYTES)return reject('too_large',413);
  if(!res.body)return failure('not_image',415);
  const reader=res.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES){await reader.cancel().catch(()=>{});return failure('too_large',413);}
      chunks.push(value);
    }
  }catch{return failure('not_found',404);}
  finally{reader.releaseLock();}
  const buf=Buffer.concat(chunks,total);
  if(!matchesRaster(buf,ct))return failure('not_image',415);
  return new NextResponse(buf, { headers: { ...SECURITY_HEADERS, 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400, immutable' } });
}
