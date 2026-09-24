import {describe,expect,it} from 'vitest';
import {normalizeSaudiAddress,type SaudiAddressInput} from '@/lib/commerce/addresses';

const valid:SaudiAddressInput={
  label:'المنزل',fullName:'محمد العوفي',phone:'0501234567',alternatePhone:'',email:'m@example.com',country:'SA',
  region:'منطقة الرياض',city:'الرياض',district:'النرجس',street:'شارع الملك فهد',buildingNumber:'1234',
  secondaryNumber:'',postalCode:'12345',shortAddress:'ABCD1234',deliveryNotes:'الدور الثاني',
};

describe('Saudi commerce address validation',()=>{
  it('normalizes a complete Saudi shipping address for an immutable order snapshot',()=>{
    expect(normalizeSaudiAddress(valid)).toEqual({...valid,phone:'+966501234567',alternatePhone:null,country:'SA'});
  });
  it.each(['fullName','phone','region','city','district','street','buildingNumber','postalCode'] as const)(
    'rejects missing required field %s',field=>{
      expect(()=>normalizeSaudiAddress({...valid,[field]:''})).toThrow(`address_${field}_required`);
    },
  );
  it('rejects non-Saudi country and malformed optional mobile/email values',()=>{
    expect(()=>normalizeSaudiAddress({...valid,country:'AE'})).toThrow('address_country_invalid');
    expect(()=>normalizeSaudiAddress({...valid,alternatePhone:'123'})).toThrow('address_alternate_phone_invalid');
    expect(()=>normalizeSaudiAddress({...valid,email:'bad'})).toThrow('address_email_invalid');
  });
  it('does not accept control characters or overlong address fields',()=>{
    expect(()=>normalizeSaudiAddress({...valid,deliveryNotes:'bad\nvalue'})).toThrow('address_field_invalid');
    expect(()=>normalizeSaudiAddress({...valid,street:'x'.repeat(201)})).toThrow('address_field_invalid');
  });
});
