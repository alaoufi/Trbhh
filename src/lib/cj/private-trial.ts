import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
export async function requireCjLiveTrialAuthority(memberId:bigint):Promise<void>{
 if(process.env.CJ_LIVE_TRIAL_ENABLED!=='true')throw new Error('cj_live_trial_disabled');
 const {requireAnyAdmin}=await import('@/lib/roles');
 const actor=await requireAnyAdmin();
 if(BigInt(actor.uid)!==memberId)throw new Error('cj_live_trial_owner_mismatch');
}
/** Public commerce flags may be bypassed ONLY for an authenticated staff owner
 * with a server-persisted immutable CJ quote and the explicit private-trial flag. */
export async function isOwnedCjLiveTrial(db:CommerceDb,memberId:bigint,orderId:bigint):Promise<boolean>{
 if(process.env.CJ_LIVE_TRIAL_ENABLED!=='true')return false;
 const rows=await db.$queryRaw<{id:bigint}[]>`SELECT o.id FROM commerce_orders o JOIN commerce_cj_order_quotes q ON q.commerce_order_id=o.id WHERE o.id=${orderId} AND o.member_id=${memberId} LIMIT 1`;
 if(!rows.length)return false;
 try{await requireCjLiveTrialAuthority(memberId);return true;}catch{return false;}
}
