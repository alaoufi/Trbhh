import {describe, expect, it} from 'vitest';
import {paymentMatches, normalizeRecipients} from '@/lib/commerce/orders';
const expected={amountMinor:1025,currency:'SAR',reference:'ref-1',merchantOrderId:'commerce:1',provider:'test'};
describe('verified commerce payment evidence', () => {
  it('requires explicit verified paid evidence and exact identifiers', () => {
    expect(paymentMatches(expected,{...expected,verified:true,status:'paid'})).toBe(true);
  });
  it.each([{amountMinor:1024},{amountMinor:0},{amountMinor:1025.5},{currency:'USD'},{currency:'sar'},{reference:'other'},{reference:''},{merchantOrderId:'other'},{provider:'other'},{verified:false},{status:'pending'}])('rejects mismatched evidence %j', patch => {
    expect(paymentMatches(expected,{...expected,verified:true,status:'paid',...patch})).toBe(false);
  });
  it('deduplicates only exact recipient/channel pairs', () => {
    expect(normalizeRecipients([{recipient:'member:1',channel:'in_app'},{recipient:'member:1',channel:'in_app'},{recipient:'member:1',channel:'sms'}])).toHaveLength(2);
    expect(() => normalizeRecipients([{recipient:'',channel:'sms'}])).toThrow();
    expect(() => normalizeRecipients([{recipient:'member:1',channel:'fax'}])).toThrow();
  });
});
