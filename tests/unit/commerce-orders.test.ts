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
  it('binds one selected stable variant to the order fingerprint and rejects two variants of the same product',()=>{
    const lines=normalizeOrderRequest([{productId:3n,quantity:1,variantKey:'VID-BLK-XL'},{productId:3n,quantity:2,variantKey:'VID-BLK-XL'}]);
    expect(lines).toEqual([{productId:3n,quantity:3,variantKey:'VID-BLK-XL'}]);
    expect(requestFingerprint(lines)).not.toBe(requestFingerprint([{productId:3n,quantity:3,variantKey:'VID-RED-M'}]));
    expect(()=>normalizeOrderRequest([{productId:3n,quantity:1,variantKey:'VID-BLK-XL'},{productId:3n,quantity:1,variantKey:'VID-RED-M'}])).toThrow('duplicate_product_variant');
  });
  it('binds every shipping detail into the order idempotency fingerprint and rejects legacy incomplete addresses',()=>{
    const complete={name:'Buyer',phone:'+966500000000',addressLine:'District، Street، 4',city:'Riyadh',postalCode:'12345',country:'SA' as const,region:'Riyadh Region',district:'District',street:'Street',buildingNumber:'4',secondaryNumber:'',alternatePhone:null,email:'',shortAddress:'',deliveryNotes:''};
    expect(requestFingerprint([{productId:1n,quantity:1}],complete)).not.toBe(requestFingerprint([{productId:1n,quantity:1}],{...complete,district:'Changed district',addressLine:'Changed district، Street، 4'}));
    expect(()=>requestFingerprint([{productId:1n,quantity:1}],{name:'Buyer',phone:'+966500000000',addressLine:'Address',city:'Riyadh',postalCode:'12345',country:'SA'})).toThrow();
  });
  it('rejects untrusted ID/key before database access', async () => {
    const tx=vi.fn();const db={$transaction:tx} as unknown as CommerceDb;
    await expect(createOrder(db,{memberId:0n,requestKey:'bad',items:[{productId:1n,quantity:1}],shipping:{name:'Test',phone:'+966500000000',addressLine:'District، Test، 1',city:'Riyadh',postalCode:'12345',country:'SA',region:'Riyadh',district:'District',street:'Test',buildingNumber:'1',secondaryNumber:'',alternatePhone:null,email:'',shortAddress:'',deliveryNotes:''}},{shippingFeeMinor:0})).rejects.toThrow();
    expect(tx).not.toHaveBeenCalled();
  });
});
