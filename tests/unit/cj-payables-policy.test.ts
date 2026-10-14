import {describe,it,expect} from 'vitest';
import {settlementSelection,settlementWaitHours,settlementPaymentUrl} from '@/app/admin/suppliers/cj/payables/policy';
describe('CJ payables input and official payment URL',()=>{
  it('accepts ten independently identified requests and rejects repeat or malformed IDs',()=>{
    expect(settlementSelection(Array.from({length:10},(_,index)=>String(index+1)))).toHaveLength(10);
    for(const ids of [[],['1','1'],['0'],['1e3'],['-1'],['18446744073709551616'],Array.from({length:21},(_,index)=>String(index+1))]) expect(()=>settlementSelection(ids)).toThrow('selection');
  });
  it('bounds waiting without accepting exponent/blank/unlimited',()=>{
    expect(settlementWaitHours('1')).toBe(1);expect(settlementWaitHours('168')).toBe(168);
    for(const value of ['',null,'0','169','1e2','1.5'])expect(()=>settlementWaitHours(value)).toThrow('wait');
  });
  it('exposes only fresh canonical CJ parent payment links',()=>{
    const expiry=new Date(2000);const good='https://www.cjdropshipping.com/mine/payment?pid=pay_123';
    expect(settlementPaymentUrl(good,expiry,1000)).toBe(good);
    for(const bad of ['https://evil.example/mine/payment?pid=pay_123','https://www.cjdropshipping.com.evil.example/mine/payment?pid=pay_123','http://www.cjdropshipping.com/mine/payment?pid=pay_123',`${good}&redirect=https://evil.example`,`${good}#x`,`${good}&pid=other`])expect(settlementPaymentUrl(bad,expiry,1000)).toBeNull();
    expect(settlementPaymentUrl(good,expiry,2000)).toBeNull();expect(settlementPaymentUrl(good,null,1000)).toBeNull();
  });
});
