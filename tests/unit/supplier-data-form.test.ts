import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {SupplierDataForm} from '@/components/supplier-data-form';

describe('public supplier data form',()=>{
 it('shows grouped onboarding fields and supplier-only actions without admin navigation',()=>{
  const html=renderToStaticMarkup(createElement(SupplierDataForm,{token:'A'.repeat(43),supplierName:'متجر الاختبار',status:'draft',values:{store_name:'متجر الاختبار'}}));
  for(const text of ['بيانات المنشأة والمتجر','بيانات المسؤول','التشغيل والشحن','السياسات والإقرارات','البيانات البنكية','حفظ كمسودة','إرسال للمراجعة'])expect(html).toContain(text);
  for(const name of ['establishment_name','store_name','store_url','registration_number','contact_name','phone','email','iban','agreements'])expect(html).toContain(`name="${name}"`);
  expect(html).toMatch(/<button[^>]*formNoValidate=""[^>]*value="draft"|<button[^>]*value="draft"[^>]*formNoValidate=""/);
  expect(html).not.toContain('لوحة التحكم');
  expect(html).not.toContain('/admin');
  expect(html).toContain('لا يمنح أي دخول إلى لوحة تربح أو صلاحيات إدارية');
 });

 it('locks the form after final submission',()=>{
  const html=renderToStaticMarkup(createElement(SupplierDataForm,{token:'A'.repeat(43),supplierName:'متجر الاختبار',status:'submitted',values:{}}));
  expect(html).toContain('تم إرسال البيانات للمراجعة');
  expect(html).not.toContain('إرسال للمراجعة');
 });
});
