import {describe,it,expect} from 'vitest';
import {delegateMessage,delegateWhatsappUrl} from '@/lib/cj/delegate-message';
describe('delegate escalation message',()=>{
 it('keeps exact references and does not manufacture missing operation numbers',()=>{
  const message=delegateMessage({problem:'رفض 803',requested:'تحقق من المطابقة',orderId:'42',operationId:'77',supplierOrderId:'SD123',products:[{storefrontProductId:'281',pid:'123',vid:'456',quantity:1}]});
  expect(message).toContain('رقم المنتج: 281');expect(message).toContain('رقم العملية: 77');expect(message).toContain('الطلب الخارجي: SD123');expect(message).toContain('معرّف الخيار: 456');
  expect(delegateMessage({problem:'خطأ',requested:'مراجعة'})).not.toContain('رقم العملية:');
 });
 it('redacts tokens and customer contacts from pasted diagnostics',()=>{
  const message=delegateMessage({problem:'CJ-Access-Token: secret-value user@example.com +966501234567',requested:'مراجعة'});
  expect(message).not.toContain('secret-value');expect(message).not.toContain('user@example.com');expect(message).not.toContain('966501234567');
 });
 it('opens recipient selection with encoded message rather than sending',()=>{
  const message='مشكلة & رقم 281';const url=new URL(delegateWhatsappUrl(message));expect(url.origin).toBe('https://wa.me');expect(url.pathname).toBe('/');expect(url.searchParams.get('text')).toBe(message);
 });
 it('redacts JSON secrets and local phones without corrupting product references',()=>{const message=delegateMessage({problem:'{"accessToken":"sensitive-value"} 0501234567',requested:'مراجعة',productId:'281',sourceProductId:'2610070813191630000',amountMinor:1250,currency:'USD'});expect(message).not.toContain('sensitive-value');expect(message).not.toContain('0501234567');expect(message).toContain('2610070813191630000');expect(message).toContain('12.50 USD');});
});
