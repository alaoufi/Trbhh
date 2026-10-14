import 'server-only';
import {cjPrivateFinancialOperationsAllowed} from '../live-gates';
import {fulfillmentStore} from './store';
import {makeFulfillmentProvider} from './provider';
import {runFulfillment} from './worker';
import {verifyCjCommitmentFresh} from './freshness';
import {getCjSettlementWalletAuthorization} from '../settlements';
/** Called by an authenticated staff/cron dispatcher, never a bank return page. */
export async function processCjFulfillment(id:string,options:{cardOnly?:boolean}={}):Promise<void>{
 if(!(await cjPrivateFinancialOperationsAllowed()))throw Error('cj_fulfillment_disabled');
 const row=await fulfillmentStore.read(id);if(!row?.customerPaidVerified)return;
 const provider=makeFulfillmentProvider(row.commitment);
 // Prove already-paid external card orders before checking current available
 // inventory: stock can legitimately fall when CJ allocates a paid order.
 if(row.cjOrderId&&row.status==='payment_ready'){
  await runFulfillment(id,fulfillmentStore,provider,{reconcileOnly:true});
  const current=await fulfillmentStore.read(id);if(!current||current.status!==row.status||current.version!==row.version)return;
 }
 const grant=options.cardOnly?null:await getCjSettlementWalletAuthorization(id);
 if(['pending','created'].includes(row.status)||row.status==='payment_ready'&&grant){
  const fresh=await verifyCjCommitmentFresh(row.commitment);
  if(!fresh.ok){await fulfillmentStore.cas(id,row.version,{lastError:fresh.reason,evidence:{freshness:fresh,observedAt:new Date().toISOString()}});return;}
 }
 await runFulfillment(id,fulfillmentStore,provider,grant?{paymentMode:'wallet',walletAuthorization:{payId:grant.payId,shipmentOrderId:grant.shipmentOrderId,expectedUsdMinor:grant.expectedUsdMinor}}:{paymentMode:'card'});
}
/** Explicitly non-financial preparation, even if a separate grant is queued. */
export async function prepareCjFulfillmentCardPayment(id:string):Promise<void>{
 await processCjFulfillment(id,{cardOnly:true});
}
/** Administrator refresh: provider reads only, never create/cart/debit. */
export async function reconcileCjFulfillmentPayment(id:string):Promise<void>{
 if(!(await cjPrivateFinancialOperationsAllowed()))throw Error('cj_fulfillment_disabled');
 const row=await fulfillmentStore.read(id);if(!row?.customerPaidVerified||!row.cjOrderId)return;
 await runFulfillment(id,fulfillmentStore,makeFulfillmentProvider(row.commitment),{reconcileOnly:true});
}
