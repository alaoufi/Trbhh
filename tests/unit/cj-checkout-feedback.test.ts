import {describe,it,expect} from 'vitest';
import {cjCheckoutFailure,cjCheckoutFeedback} from '@/lib/cj/checkout-feedback';
describe('CJ checkout failures',()=>{
 it.each([['finance_issuance_not_approved','fiscal'],['cj_live_margin_unapproved','pricing'],['cj_pricing_unverified','pricing'],['cj_live_warehouse_ambiguous','warehouse'],['cj_live_freight_changed','changed'],['cj_live_provider_unavailable','provider']])('classifies %s without hiding the blocking category',(code,reason)=>{expect(cjCheckoutFailure(Error(code))).toBe(reason);expect(cjCheckoutFeedback(reason)).toBeTruthy();});
 it('does not expose unknown provider or database error payloads',()=>{expect(cjCheckoutFailure(Error('secret token customer data'))).toBe('recheck');expect(cjCheckoutFeedback('secret token customer data')).toBeNull();expect(cjCheckoutFeedback('__proto__')).toBeNull();});
});
