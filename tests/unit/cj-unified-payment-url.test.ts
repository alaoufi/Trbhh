import {describe,it,expect} from 'vitest';
import {unifiedSettlementPaymentUrl} from '@/lib/cj/settlements/presentation';
function fixture(){const expiresAt=Date.now()+60000;return Array.from({length:10},()=>({status:'pending',fulfillment_status:'payment_ready',last_error:null,pay_id:'ONE',pay_expires_at:new Date(expiresAt),total_usd_minor:100,evidence_json:{payment:{batchId:'9',batchPayableUsdMinor:1000,payId:'ONE',shipmentOrderId:'SHIP',expiresAt,payableUsdMinor:100}},wallet_authorized:0n}));}
describe('one shared cashier link (simulated)',()=>{
 it('shows one link only when all ten members and totals match',()=>expect(unifiedSettlementPaymentUrl('9',1000,fixture())).toBe('https://www.cjdropshipping.com/mine/payment?pid=ONE'));
 it('hides the link after partial payment, expiry, mismatch, or customer objection',()=>{for(const scenario of ['paid','expired','amount','objection']){const rows=fixture();if(scenario==='paid')rows[0].status='paid';if(scenario==='expired')rows[0].pay_expires_at=new Date(0);if(scenario==='amount')rows[0].evidence_json.payment.batchPayableUsdMinor=999;const withException=rows as (typeof rows[number]&{evidence_json:typeof rows[number]['evidence_json']&{exception?:{actionRequired:boolean}}})[];if(scenario==='objection')withException[0].evidence_json.exception={actionRequired:true};expect(unifiedSettlementPaymentUrl('9',1000,rows)).toBeNull();}});
});
