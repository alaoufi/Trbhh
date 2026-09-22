import {describe,expect,it,vi} from 'vitest';
import {normalizeStoreCoordinatorPhone,buildCoordinatorOrderMessage,deliverCoordinatorNotifications} from '@/lib/suppliers/coordinator';
import type {CommerceDb} from '@/lib/commerce/types';

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
  it('delivers one paid submitted order through the configured notifier and records its provider reference',async()=>{
    const row={id:8n,supplier_order_id:5n,order_id:41n,external_order_id:'9001',external_order_url:'https://s.salla.sa/orders/order/safe',recipient:'+966511111111',request_snapshot:{shipping:{name:'محمد',phone:'+966500000000',city:'الرياض',addressLine:'حي النرجس',postalCode:'12345',country:'SA'},items:[{externalId:'123',sku:'SKU-1',name:'منتج تجريبي',quantity:2,unitCostMinor:100}],shippingNotes:'مساءً'}};
    const query=vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]),execute=vi.fn().mockResolvedValue(1);
    const db={$transaction:vi.fn(fn=>fn({$queryRaw:query,$executeRaw:execute}))} as unknown as CommerceDb;
    const notifier={channel:'sms' as const,send:vi.fn().mockResolvedValue({providerMessageId:'sandbox-message-1'})};
    expect(await deliverCoordinatorNotifications(db,notifier,5)).toBe(1);
    expect(notifier.send).toHaveBeenCalledWith(expect.objectContaining({recipient:'+966511111111',deduplicationKey:'trbhh:supplier-order:5:order_submitted',message:expect.stringContaining('طلب تربح #41')}));
    expect(execute.mock.calls.some(call=>call.slice(1).includes('sandbox-message-1'))).toBe(true);
  });
  it('does not expose customer data when no paid submitted notification is eligible',async()=>{
    const db={$transaction:vi.fn(fn=>fn({$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()}))} as unknown as CommerceDb;
    const notifier={channel:'sms' as const,send:vi.fn()};
    expect(await deliverCoordinatorNotifications(db,notifier)).toBe(0);expect(notifier.send).not.toHaveBeenCalled();
  });
});
