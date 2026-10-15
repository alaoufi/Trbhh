import {describe,it,expect} from 'vitest';
import {assertSaudiCjCheckoutAddress,assertSaudiCjSupplierAddress,canonicalCjDestination} from '@/lib/cj/live-destination';
import {shippingPayload} from '@/lib/cj/fulfillment/provider';
describe('Lomi Saudi shipping prerequisites',()=>{
 const address={country:'SA',phone:'+966500000000',street:'King Road',buildingNumber:'1234',shortAddress:'ABCD1234'};
 it('accepts complete national delivery details',()=>expect(()=>assertSaudiCjCheckoutAddress(address)).not.toThrow());
 it('rejects a historical supplier destination missing the required short address before new supplier operations',()=>expect(()=>assertSaudiCjSupplierAddress({country:'SA',phone:'+966500000000',address1:'Street 1234',houseNumber:'1234'})).toThrow('national_address'));
 it('retains the short address and supplies CJ houseNumber explicitly',()=>{const destination=canonicalCjDestination({...address,name:'Buyer',region:'Riyadh',city:'Riyadh',postalCode:'12345'});expect(destination.address1).toContain('ABCD1234');expect(canonicalCjDestination(destination,{alreadyCanonical:true})).toEqual(destination);expect(shippingPayload({destination} as never)).toMatchObject({houseNumber:'1234',shippingPhone:'+966500000000'});});
 it.each(['phone','street','buildingNumber','shortAddress'])('rejects missing %s before submitting an order',key=>expect(()=>assertSaudiCjCheckoutAddress({...address,[key]:''})).toThrow());
 it('rejects invalid national short address and non-Saudi phone',()=>{expect(()=>assertSaudiCjCheckoutAddress({...address,shortAddress:'12345'})).toThrow();expect(()=>assertSaudiCjCheckoutAddress({...address,phone:'+15555555555'})).toThrow();});
});
