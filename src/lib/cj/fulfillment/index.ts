import 'server-only';
import {cjPrivateFinancialOperationsAllowed} from '../live-gates';
import {fulfillmentStore} from './store';
import {makeFulfillmentProvider} from './provider';
import {runFulfillment} from './worker';
/** Called by an authenticated staff/cron dispatcher, never a bank return page. */
export async function processCjFulfillment(id:string):Promise<void>{
 if(!(await cjPrivateFinancialOperationsAllowed()))throw Error('cj_fulfillment_disabled');
 const row=await fulfillmentStore.read(id);if(!row)return;
 await runFulfillment(id,fulfillmentStore,makeFulfillmentProvider(row.commitment));
}
