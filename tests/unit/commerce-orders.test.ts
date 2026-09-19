import {describe, expect, it, vi} from 'vitest';
import {normalizeOrderRequest, requestFingerprint, createOrder} from '@/lib/commerce/orders';
import type {CommerceDb} from '@/lib/commerce/types';

describe('commerce request identity', () => {
  it('canonicalizes order independent of item ordering and combines duplicates', () => {
    const a=normalizeOrderRequest([{productId:2n,quantity:1},{productId:1n,quantity:2},{productId:2n,quantity:3}]);
    expect(a).toEqual([{productId:1n,quantity:2},{productId:2n,quantity:4}]);
    expect(requestFingerprint(a)).toBe(requestFingerprint([{productId:2n,quantity:4},{productId:1n,quantity:2}]));
    expect(requestFingerprint(a)).not.toBe(requestFingerprint([{productId:1n,quantity:3}]));
  });
  it.each([{items:[]},{items:[{productId:0n,quantity:1}]},{items:[{productId:1n,quantity:0}]},{items:[{productId:1n,quantity:1.5}]},{items:[{productId:1n,quantity:10001}]}])('rejects malformed basket', ({items}) => {
    expect(() => normalizeOrderRequest(items)).toThrow();
  });
  it('rejects client prices and excess keys instead of signing ignored content', () => {
    expect(() => normalizeOrderRequest([{productId:1n,quantity:1,price:1}])).toThrow();
  });
  it('rejects untrusted ID/key before database access', async () => {
    const tx=vi.fn();const db={$transaction:tx} as unknown as CommerceDb;
    await expect(createOrder(db,{memberId:0n,requestKey:'bad',items:[{productId:1n,quantity:1}],shipping:{name:'Test',phone:'+966500000000',addressLine:'Test',city:'Riyadh',postalCode:'12345',country:'SA'}},{shippingFeeMinor:0})).rejects.toThrow();
    expect(tx).not.toHaveBeenCalled();
  });
});
