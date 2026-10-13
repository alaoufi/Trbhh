import 'server-only';
/** Dedicated private CJ path only. Never consult or change the shared supplier
 * gate: Salla and legacy CJ writes keep their existing independent blockade. */
export function cjPrivateRuntimeEnabled():boolean{
 return process.env.CJ_ALLOW_LIVE_ORDERS==='true'&&process.env.CJ_FULFILLMENT_WORKER_ENABLED==='true'&&process.env.CJ_LIVE_TRIAL_ENABLED==='true';
}
export async function cjPrivateFinancialOperationsAllowed():Promise<boolean>{
 if(!cjPrivateRuntimeEnabled())return false;
 try{const {getCommerceConfig}=await import('@/lib/commerce/settings');return (await getCommerceConfig()).purchasingEnabled===true;}catch{return false;}
}
