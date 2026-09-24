import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {hasAccess} from '@/lib/access-control/guards';
import {validateTrialCart} from '@/lib/cj/trial-cart';
import {quoteCjTrialCart} from '@/lib/cj/trial-quote';
import {primaryOrigin} from '@/lib/public-origin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const MAX_BYTES=256*1024;
function error(code:string,status:number){return NextResponse.json({error:code},{status,headers});}
function trustedOrigin(origin:string|null,requestUrl:string):boolean{
  // Standalone Next uses its internal bind host in request.url behind the proxy.
  if(origin===primaryOrigin)return true;
  if(process.env.NODE_ENV==='production'||!origin)return false;
  try{
    const local=new URL(requestUrl);
    return ['http:','https:'].includes(local.protocol)&&['localhost','127.0.0.1','[::1]'].includes(local.hostname)&&origin===local.origin;
  }catch{return false;}
}
async function boundedBody(request:Request):Promise<unknown>{
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))throw Error('body_too_large');
  if(!request.body)throw Error('invalid_cart');
  const reader=request.body.getReader();let bytes=0;const parts:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){void reader.cancel().catch(()=>{});throw Error('body_too_large');}parts.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(bytes);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{throw Error('invalid_cart');}
}
export async function POST(request:Request){
  try{
    const session=await getSession();if(!session)return error('unauthorized',401);
    if(!(await hasAccess(session.uid,'products','view')))return error('forbidden',403);
    const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
    if(!trustedOrigin(origin,request.url)||(site!==null&&site!=='same-origin'))return error('forbidden',403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return error('json_required',415);
    let items;
    try{
      const body=await boundedBody(request);
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='items')throw Error('invalid_cart');
      items=validateTrialCart((body as {items:unknown}).items);
    }catch(cause){return cause instanceof Error&&cause.message==='body_too_large'?error('body_too_large',413):error('invalid_cart',400);}
    return NextResponse.json(await quoteCjTrialCart(items),{headers});
  }catch(cause){return cause instanceof Error&&cause.message==='invalid_total'?error('invalid_total',422):error('unavailable',503);}
}
