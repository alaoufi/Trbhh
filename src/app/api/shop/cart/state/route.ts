import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {assertCommerceSchemaReady} from '@/lib/commerce/schema';
import {mergeCartLines,normalizeCart,type CartLine} from '@/lib/commerce/cart';
import {primaryOrigin} from '@/lib/public-origin';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function error(code:string,status:number){return NextResponse.json({error:code},{status,headers});}
function trustedOrigin(request:Request){
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if(origin===primaryOrigin)return site===null||site==='same-origin';
 if(process.env.NODE_ENV!=='production'&&origin){try{const url=new URL(request.url);return ['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&origin===url.origin&&(site===null||site==='same-origin');}catch{}}
 return false;
}
async function bodyItems(request:Request){
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>16_384))throw Error('too_large');
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>16_384)throw Error('too_large');
 const body=JSON.parse(raw) as {items?:unknown};if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='items')throw Error('invalid');
 return normalizeCart(body.items);
}
async function member(){const session=await getSession().catch(()=>null);return session?.uid?BigInt(session.uid):null;}
export async function GET(){
 try{const id=await member();if(!id)return error('unauthorized',401);await assertCommerceSchemaReady(prisma);const [row]=await prisma.$queryRaw<{items:CartLine[]|string}[]>`SELECT items FROM commerce_customer_carts WHERE member_id=${id} LIMIT 1`;const items=typeof row?.items==='string'?JSON.parse(row.items) as unknown:row?.items??[];return NextResponse.json({items:normalizeCart(items)},{headers});}
 catch{return error('cart_unavailable',503);}
}
async function save(request:Request,mode:'merge'|'replace'){
 try{
  const id=await member();if(!id)return error('unauthorized',401);if(!trustedOrigin(request))return error('forbidden',403);
  let submitted:CartLine[];try{submitted=await bodyItems(request);}catch(cause){return error(cause instanceof Error&&cause.message==='too_large'?'cart_too_large':'cart_invalid',cause instanceof Error&&cause.message==='too_large'?413:400);}
  await assertCommerceSchemaReady(prisma);
  const stored=await prisma.$transaction(async tx=>{
   const [owner]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM users WHERE id=${id} FOR UPDATE`;if(!owner)throw Error('member_invalid');
   const [row]=await tx.$queryRaw<{items:CartLine[]|string}[]>`SELECT items FROM commerce_customer_carts WHERE member_id=${id} FOR UPDATE`;
   const current=typeof row?.items==='string'?JSON.parse(row.items) as unknown:row?.items??[];
   const result=mode==='merge'?mergeCartLines(normalizeCart(current),submitted):submitted;
   await tx.$executeRaw`INSERT INTO commerce_customer_carts(member_id,items) VALUES(${id},${JSON.stringify(result)}) ON DUPLICATE KEY UPDATE items=VALUES(items),updated_at=CURRENT_TIMESTAMP(3)`;
   return result;
  });
  return NextResponse.json({items:stored},{headers});
 }catch{return error('cart_unavailable',503);}
}
export async function POST(request:Request){return save(request,'merge');}
export async function PUT(request:Request){return save(request,'replace');}
