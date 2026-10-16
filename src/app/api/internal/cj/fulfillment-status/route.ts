import {NextResponse} from 'next/server';
import {constantSecret} from '@/lib/suppliers/crypto';
import {prisma} from '@/lib/prisma';
import {reconcileCjFulfillment} from '@/lib/cj/fulfillment/status';
import {reconcileCjSettlementForFulfillment} from '@/lib/cj/settlements';
import {reconcileCjFulfillmentPayment} from '@/lib/cj/fulfillment';
import {getCjOrderDetailBatch} from '@/lib/cj/client';
import {deliverSupplierNotices} from '@/lib/suppliers/tracking';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
/** Read-only supplier reconciliation continues when new purchases are stopped. */
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers});
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 if(secret.length<32)return fail('not_configured',503);
 const auth=request.headers.get('authorization')||'';
 if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return fail('unauthorized',401);
 try{
  const rows=await prisma.$queryRaw<{id:bigint;cj_order_id:string;supplier_reference:string}[]>`SELECT f.id,f.cj_order_id,f.supplier_reference FROM commerce_cj_fulfillment_outbox f JOIN commerce_orders o ON o.id=f.commerce_order_id WHERE f.cj_order_id IS NOT NULL AND o.status='paid' AND o.fulfillment_status<>'completed' ORDER BY f.updated_at ASC,f.id ASC LIMIT 10`;
  if(!rows.length)return NextResponse.json({checked:0},{headers});
  // Rotate before the external call: one missing/unavailable order cannot starve others.
  for(const row of rows)await prisma.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=${row.id}`;
  const result=await getCjOrderDetailBatch([...new Set(rows.map(r=>r.cj_order_id))]);
  if(!result.ok)return fail('cj_status_unavailable',503);
  let checked=0;
  for(const row of rows){
   const matches=result.data.filter(d=>d.orderId===row.cj_order_id&&d.orderNum===row.supplier_reference);
   if(matches.length!==1)continue;
   try{await reconcileCjFulfillmentPayment(String(row.id),matches[0]);await reconcileCjFulfillment(String(row.id),matches[0]);await reconcileCjSettlementForFulfillment(String(row.id));checked++;}catch{/* other members still progress */}
  }
  if(checked!==rows.length)return fail('cj_status_unavailable',503);
  // Keep the installed host runner's checked=0/1 contract; expose order count separately.
  return NextResponse.json({checked:1,ordersChecked:checked},{headers});
 }catch{return fail('cj_status_unavailable',503);}
 finally{
  // The standalone CJ timer also drains the existing atomic in-app outbox.
  // Delivery is local, remains available with purchasing disabled, and retries
  // on later ticks if its transaction fails; it never authorizes supplier writes.
  try{await deliverSupplierNotices(prisma,20);}catch{/* Durable pending rows remain for retry. */}
 }
}
