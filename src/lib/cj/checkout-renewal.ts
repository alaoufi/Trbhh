import 'server-only';
import {createHash} from 'node:crypto';
import type {CommerceDb} from '@/lib/commerce/types';
import {cancelUnstartedOrder} from '@/lib/commerce/orders';
/** A replacement is a NEW order/quote, never an overwrite of financial history.
 * Cancellation rechecks attempts while holding the same order lock as bank claim. */
export async function resolveCjCheckoutRequestKey(db:CommerceDb,memberId:bigint,baseKey:string,now:Date,cancel:typeof cancelUnstartedOrder=cancelUnstartedOrder):Promise<string>{
 let key=baseKey;
 for(let version=0;version<20;version++){
  const [order]=await db.$queryRaw<{id:bigint;status:string;attempts:number|bigint}[]>`SELECT o.id,o.status,(SELECT COUNT(*) FROM commerce_payment_attempts a WHERE a.order_id=o.id) AS attempts FROM commerce_orders o WHERE o.member_id=${memberId} AND o.request_key=${key}`;
  if(!order)return key;
  if(order.status==='paid'||Number(order.attempts)>0)return key;
  if(!['awaiting_payment','cancelled'].includes(order.status))throw new Error('cj_checkout_state_conflict');
  if(order.status==='awaiting_payment'){
   const rows=await db.$queryRaw<{quote_json:unknown}[]>`SELECT quote_json FROM commerce_cj_order_quotes WHERE commerce_order_id=${order.id}`;
   if(!rows.length)throw new Error('cj_live_quote_required');
   const expired=rows.some(row=>{const q=(typeof row.quote_json==='string'?JSON.parse(row.quote_json):row.quote_json) as {expiresAt:string};const expiry=Date.parse(q.expiresAt);if(!Number.isFinite(expiry))throw new Error('cj_quote_snapshot_changed');return expiry<=now.getTime();});
   if(!expired)return key;
   await cancel(db,{memberId,orderId:order.id});
  }
  key=`cjr-${createHash('sha256').update(JSON.stringify({base:baseKey,previous:String(order.id)})).digest('hex').slice(0,60)}`;
 }
 throw new Error('cj_checkout_renewal_limit');
}
