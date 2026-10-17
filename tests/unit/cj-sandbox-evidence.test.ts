import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {verdict}=require('../../scripts/diagnostics/cj-sandbox-evidence.cjs');
describe('read-only evidence verdict',()=>{
 it('does not promote provider success to full business readiness',()=>{
 const r=verdict({order:{identityVerified:true,referenceRead:{ok:true,evidence:{status:'UNSHIPPED',trackingMatched:true}},codeRead:{ok:true,evidence:{status:'UNSHIPPED',trackingMatched:true}}}},{events:[{status:'UNSHIPPED'}],summary:{trackingReceived:false},businessLinks:{commerce:0,legacy:0}});
 expect(r.sandboxPaidVerified).toBe(true);expect(r.paidWebhookReceived).toBe(true);expect(r.trackingWebhookReceived).toBe(false);expect(r.readyForLivePurchase).toBe(false);expect(r.customerOrderRoundtripVerified).toBe(false);
 });
 it('preserves partial failures and identifies extraction mismatch',()=>{
 const r=verdict(undefined,{summary:{rawTrackingPresentButNotIndexed:true}});
 expect(r.sourceIdentityVerified).toBe(false);expect(r.sandboxPaidVerified).toBe(false);expect(r.trackingFinding).toBe('RAW_TRACKING_NOT_INDEXED');expect(r.isolatedFromCustomerOrders).toBe(false);
 });
});
