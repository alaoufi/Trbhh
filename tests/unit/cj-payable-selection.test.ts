import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/app/admin/suppliers/cj/payables/actions',()=>({prepareSettlement:vi.fn()}));
import {PayableSelection} from '@/app/admin/suppliers/cj/payables/selection';
describe('selected CJ payment entry',()=>{
 it('shows ten independent payable choices with one guarded main payment button and no card fields',()=>{
  const rows=Array.from({length:10},(_,i)=>({id:String(i+1),commerceOrderId:String(i+1),cjOrderId:`CJ${i+1}`,status:'payment_ready',productUsdMinor:500,shippingUsdMinor:250,taxUsdMinor:0,totalUsdMinor:750,overdue:false}));
  const html=renderToStaticMarkup(createElement(PayableSelection,{rows,requestKey:'12345678-1234-1234-1234-123456789abc'}));
  expect(html.match(/name="fulfillmentId"/g)).toHaveLength(10);
  expect(html).toContain('دفع جميع الطلبات');expect(html).toContain('أقدم 10 طلبات');
  expect(html).toContain('الشحن:');expect(html).toContain('المنتجات:');
  expect(html).toContain('لا يُخصم أي مبلغ');expect(html).toContain('disabled=""');
  expect(html).not.toMatch(/name="(?:cardNumber|cvv|pan)"/);
 });
});
