import {describe,it,expect} from 'vitest';
import {canonicalCjDestination} from '@/lib/cj/live-destination';
const raw={country:'SA',name:'Buyer',phone:'+966500000000',region:'Riyadh',city:'Riyadh',address1:'District، Street، 1234',address2:'Apartment 2',postalCode:'12345'};
describe('CJ immutable supplier destination',()=>{
 it.each(['name','region','city','phone'])('rejects provider-overlength %s before quoting or bank payment without truncating',key=>{const maximum=key==='phone'?20:50;expect(()=>canonicalCjDestination({...raw,[key]:'x'.repeat(maximum+1)})).toThrow('cj_destination_field_too_long');const canonical=canonicalCjDestination({...raw,[key]:'x'.repeat(maximum)});expect(canonical[key as keyof typeof canonical]).toBe('x'.repeat(maximum));expect(()=>canonicalCjDestination({...canonical,[key]:'x'.repeat(maximum+1)},{alreadyCanonical:true})).toThrow('cj_destination_field_too_long');});
 it('preserves exact extra address and postcode in the transmitted address',()=>{const value=canonicalCjDestination(raw);expect(value.address1).toBe('District، Street، 1234، العنوان الإضافي: Apartment 2، الرمز البريدي 12345');expect(value.address2).toBe('Apartment 2');expect(value.postalCode).toBe('12345');});
 it('validates already canonical destination without duplicating postal content',()=>{const value=canonicalCjDestination(raw);expect(canonicalCjDestination(value,{alreadyCanonical:true})).toEqual(value);});
 it('normalizes owned commerce shipping snapshot with the same result',()=>{const {address1,...rest}=raw;expect(canonicalCjDestination({...rest,addressLine:address1})).toEqual(canonicalCjDestination(raw));});
 it('rejects truncation beyond CJ address limit',()=>{expect(()=>canonicalCjDestination({...raw,address1:'x'.repeat(500)})).toThrow('cj_destination_too_long');});
 it('rejects changed postcode or extra address in canonical snapshot',()=>{const value=canonicalCjDestination(raw);expect(()=>canonicalCjDestination({...value,postalCode:'23456'},{alreadyCanonical:true})).toThrow();expect(()=>canonicalCjDestination({...value,address2:'Apartment 3'},{alreadyCanonical:true})).toThrow();});
});
