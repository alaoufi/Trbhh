import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import {sumMoney,checkedMoney} from '@/lib/commerce/money';
import {getCjBalance} from './client';
import {usdMinor} from './live-quote';
import {requireCjLiveTrialAuthority} from './private-trial';
import {cjPrivateRuntimeEnabled} from './live-gates';
/** Card settlement by the responsible operator does not require a funded CJ
 * wallet. Optional wallet preflight is read only and authorizes no debit. */
export async function checkCjCheckoutFunding(db:CommerceDb,input:{memberId:bigint;orderId:bigint},balance:typeof getCjBalance=getCjBalance,options:{paymentMode?:'card'|'wallet'}={}):Promise<'ready'|'funding_required'|'unavailable'>{
 try{
  const rows=await db.$queryRaw<{quote_json:unknown}[]>`SELECT q.quote_json FROM commerce_cj_order_quotes q JOIN commerce_orders o ON o.id=q.commerce_order_id WHERE o.id=${input.orderId} AND o.member_id=${input.memberId} AND o.status='awaiting_payment'`;
  if(!rows.length)return 'ready';
  if(!cjPrivateRuntimeEnabled())return 'unavailable';
  await requireCjLiveTrialAuthority(input.memberId);
  const commitment=sumMoney(rows.map(row=>{const quote=(typeof row.quote_json==='string'?JSON.parse(row.quote_json):row.quote_json) as {supplierUsdMinor:number};const amount=checkedMoney(quote.supplierUsdMinor);if(amount<=0)throw new Error('cj_quote_supplier_invalid');return amount;}));
  if(options.paymentMode!=='wallet')return 'ready';
  const available=await balance();
  if(!available.ok||typeof available.data.amountUsd!=='number')return 'unavailable';
  return usdMinor(available.data.amountUsd)>=commitment?'ready':'funding_required';
 }catch{return 'unavailable';}
}
