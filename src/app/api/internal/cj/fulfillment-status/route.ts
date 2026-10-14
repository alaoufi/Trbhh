import {NextResponse} from 'next/server';
import {constantSecret} from '@/lib/suppliers/crypto';
import {prisma} from '@/lib/prisma';
import {reconcileCjFulfillment} from '@/lib/cj/fulfillment/status';
import {reconcileCjSettlementForFulfillment} from '@/lib/cj/settlements';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** Read-only supplier reconciliation continues when new purchases are stopped. */
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers});
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 if(secret.length<32)return fail('not_configured',503);
 const auth=request.headers.get('authorization')||'';
 if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return fail('unauthorized',401);
 try{
  const rows=await prisma.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_cj_fulfillment_outbox WHERE status='supplier_paid' ORDER BY updated_at ASC,id ASC LIMIT 1`;
  if(!rows.length)return NextResponse.json({checked:0},{headers});
  // A failed provider read must not monopolize every later status refresh.
  await prisma.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=${rows[0].id} AND status='supplier_paid'`;
  await reconcileCjFulfillment(String(rows[0].id));
  await reconcileCjSettlementForFulfillment(String(rows[0].id));
  return NextResponse.json({checked:1},{headers});
 }catch{return fail('cj_status_unavailable',503);}
}
