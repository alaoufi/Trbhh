import {describe,expect,it} from 'vitest';
import {normalizeStoreCoordinatorPhone,buildCoordinatorOrderMessage} from '@/lib/suppliers/coordinator';

describe('store coordinator',()=>{
  it.each([
    ['',''],['0500000000','+966500000000'],['966500000000','+966500000000'],['+966 50 000 0000','+966500000000'],
  ])('normalizes an optional Saudi coordinator phone', (input,expected)=>{
    expect(normalizeStoreCoordinatorPhone(input)).toBe(expected);
  });
  it.each(['123','+966400000000','05000000000','+966500000000x'])('rejects an invalid coordinator phone %s',input=>{
    expect(()=>normalizeStoreCoordinatorPhone(input)).toThrow('supplier_coordinator_phone');
  });
  it('builds a minimal operational message only after Salla accepted the order',()=>{
    const message=buildCoordinatorOrderMessage({
      trbhhOrderId:'41',sallaOrderId:'9001',sallaOrderUrl:'https://s.salla.sa/orders/order/safe',
      shipping:{name:'محمد',phone:'+966500000000',city:'الرياض',addressLine:'حي النرجس',postalCode:'12345',country:'SA'},
      items:[{externalId:'123',sku:'SKU-1',name:'منتج تجريبي',quantity:2,variantName:'أحمر / كبير',unitCostMinor:100}],
      shippingNotes:'التوصيل مساءً',
    });
    expect(message).toContain('طلب تربح #41');
    expect(message).toContain('طلب سلة #9001');
    expect(message).toContain('محمد');
    expect(message).toContain('+966500000000');
    expect(message).toContain('منتج تجريبي × 2');
    expect(message).toContain('أحمر / كبير');
    expect(message).toContain('https://s.salla.sa/orders/order/safe');
    expect(message).not.toContain('100');
  });
});
