import 'server-only';
import {getCommerceConfig} from '@/lib/commerce/settings';
import {fulfillmentStore} from './store';
import {makeFulfillmentProvider} from './provider';
import {runFulfillment} from './worker';
/** Called by an authenticated staff/cron dispatcher, never a bank return page. */
export async function processCjFulfillment(id:string):Promise<void>{
 if(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='true'||process.env.CJ_FULFILLMENT_WORKER_ENABLED!=='true'||!(await getCommerceConfig()).purchasingEnabled)throw Error('cj_fulfillment_disabled');
 const row=await fulfillmentStore.read(id);if(!row)return;
 await runFulfillment(id,fulfillmentStore,makeFulfillmentProvider(row.commitment));
}
