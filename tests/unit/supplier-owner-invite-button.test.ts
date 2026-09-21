import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SupplierOwnerInviteButton} from '@/components/supplier-owner-invite-button';

describe('supplier owner authorization control',()=>{
 it('explains that the generated link is for the store owner and is temporary',()=>{
  const html=renderToStaticMarkup(createElement(SupplierOwnerInviteButton,{supplierId:'7',supplierName:'شعبيات الأولين'}));
  expect(html).toContain('إنشاء رابط تفويض لصاحب المتجر');
  expect(html).toContain('24 ساعة');
  expect(html).toContain('شعبيات الأولين');
 });
});
