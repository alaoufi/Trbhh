import {expect,it} from 'vitest';
import {taxGapReview} from '@/lib/finance/tax-registration-actions';

it('opens invoice settings for an unverified approval, without approving anything',()=>{
 expect(taxGapReview('threshold_unverified')).toMatchObject({href:'/admin/finance?section=tax#tax-policy-settings'});
});
it('opens the actual filtered wallet payment source for known service reasons',()=>{
 expect(taxGapReview('wallet_featured').href).toBe('/admin/revenue?tab=payments&cat=featured');
 expect(taxGapReview('wallet_admin_debit').href).toBe('/admin/revenue?tab=balances');
 expect(taxGapReview('wallet_refund').instructions).toContain('المستند');
});
it('routes missing invoices and refund evidence to their existing review sections',()=>{
 expect(taxGapReview('paid_unissued').href).toBe('/admin/finance?section=invoices#admin-content');
 expect(taxGapReview('refund_unmatched').href).toBe('/admin/finance?section=returns#admin-content');
});
it('never builds a destination from unknown or untrusted gap text',()=>{
 expect(taxGapReview('wallet_//evil.test').href).toBe('/admin/finance?section=reconciliation#admin-content');
});
