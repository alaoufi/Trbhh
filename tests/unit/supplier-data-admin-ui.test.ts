import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/components/supplier-data-link-controls',()=>({SupplierDataLinkControls:({status}:{status?:string})=>createElement('div',null,`روابط البيانات ${status||'none'}`),CopyOpenLink:({openLabel,copyLabel}:{openLabel:string;copyLabel:string})=>createElement('div',null,`${openLabel} ${copyLabel}`)}));
vi.mock('@/components/supplier-owner-invite-button',()=>({SupplierOwnerInviteButton:()=>createElement('div',null,'إنشاء رابط متابعة التفويض')}));
import {SupplierDataInvitePanel} from '@/components/supplier-data-invite-panel';

const values={establishment_name:'شركة',store_name:'متجر',store_url:'https://salla.sa/test-store',registration_number:'1010123456',contact_name:'محمد',identity_number:'1012345678',phone:'+966501234567',email:'owner@example.com',iban:'SA0380000000608010167519'};
const noop=async()=>{};
describe('supplier data invitation admin panel',()=>{
 it('shows a masked submitted review with explicit approve and return actions',()=>{
  const html=renderToStaticMarkup(createElement(SupplierDataInvitePanel,{supplierId:'7',supplierName:'متجر',invitation:{status:'submitted',generation:2,expiresAt:'2026-09-29T00:00:00.000Z',values},approvedStoreUrl:null,connected:false,approveAction:noop,reopenAction:noop}));
  expect(html).toContain('بانتظار المراجعة');expect(html).toContain('اعتماد بيانات المورد');expect(html).toContain('إعادة للمورد للتصحيح');
  expect(html).toContain('•••• 5678');expect(html).toContain('•••• 7519');expect(html).not.toContain('1012345678');expect(html).not.toContain('SA0380000000608010167519');
 });
 it('shows store open/copy controls and the Salla authorization control after approval',()=>{
  const html=renderToStaticMarkup(createElement(SupplierDataInvitePanel,{supplierId:'7',supplierName:'متجر',invitation:{status:'approved',generation:2,expiresAt:'2026-09-29T00:00:00.000Z',values},approvedStoreUrl:'https://salla.sa/test-store',connected:false,approveAction:noop,reopenAction:noop}));
  expect(html).toContain('فتح رابط المتجر');expect(html).toContain('نسخ رابط المتجر');expect(html).toContain('إنشاء رابط متابعة التفويض');
 });
 it('does not offer a new Salla invitation for an already connected store',()=>{
  const html=renderToStaticMarkup(createElement(SupplierDataInvitePanel,{supplierId:'7',supplierName:'متجر',invitation:null,approvedStoreUrl:'https://salla.sa/test-store',connected:true,approveAction:noop,reopenAction:noop}));
  expect(html).toContain('متصل بسلة');expect(html).not.toContain('إنشاء رابط متابعة التفويض');
 });
});
