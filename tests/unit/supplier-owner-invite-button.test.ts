import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {SupplierOwnerInviteButton} from '@/components/supplier-owner-invite-button';

describe('supplier owner authorization control',()=>{
 it('always offers creation or renewal and explains that the owner link can be retried',()=>{
  const html=renderToStaticMarkup(createElement(SupplierOwnerInviteButton,{supplierId:'7',supplierName:'شعبيات الأولين'}));
  expect(html).toContain('إنشاء/تجديد رابط تفويض سلة');
  expect(html).toContain('متابعة التفويض في سلة');
  expect(html).toContain('24 ساعة');
  expect(html).toContain('أكثر من مرة');
 expect(html).toContain('شعبيات الأولين');
 });
 it('submits the URL-encoded body required by the hardened OAuth form reader',()=>{
  const source=readFileSync('src/components/supplier-owner-invite-button.tsx','utf8');
  expect(source).toContain("new URLSearchParams({supplierId})");
  expect(source).toContain("'Content-Type':'application/x-www-form-urlencoded'");
  expect(source).not.toContain('new FormData()');
 });
});
