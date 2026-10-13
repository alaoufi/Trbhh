import {NextResponse} from 'next/server';
import {constantSecret} from '@/lib/suppliers/crypto';
import {prisma} from '@/lib/prisma';
import {processCjFulfillment} from '@/lib/cj/fulfillment';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** Dedicated financial dispatcher; the existing read-only polling route stays read-only. */
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers});
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 if(secret.length<32)return fail('not_configured',503);
 const auth=request.headers.get('authorization')||'';
 if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return fail('unauthorized',401);
 if(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='true'||process.env.CJ_FULFILLMENT_WORKER_ENABLED!=='true')return fail('cj_fulfillment_disabled',503);
 try{
  const rows=await prisma.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_cj_fulfillment_outbox WHERE status IN ('pending','creating','created','create_uncertain','parent_claimed','payment_ready','debit_claimed','debit_uncertain') ORDER BY updated_at ASC,id ASC LIMIT 1`;
  if(!rows.length)return NextResponse.json({processed:0},{headers});
  // Rotate even incomplete reconciliation attempts; durable worker CAS remains the mutation claim.
  await prisma.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=${rows[0].id}`;
  await processCjFulfillment(String(rows[0].id));
  return NextResponse.json({processed:1},{headers});
 }catch{return fail('cj_fulfillment_unavailable',503);}
}
