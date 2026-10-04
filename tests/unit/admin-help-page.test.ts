import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import Page from '@/app/admin/help/page';
import {HELP_STEPS} from '@/lib/category-help';
Object.assign(globalThis,{React});
const mocks=vi.hoisted(()=>({auth:vi.fn(),permission:vi.fn(),setting:vi.fn()}));
vi.mock('@/lib/roles',()=>({requireAnyAdmin:mocks.auth,hasAction:mocks.permission}));
vi.mock('@/lib/settings',()=>({getSetting:mocks.setting}));
vi.mock('@/components/category-help-settings',()=>({CategoryHelpSettings:()=>null}));
describe('admin help page',()=>{
 beforeEach(()=>{mocks.auth.mockResolvedValue({uid:1});mocks.permission.mockResolvedValue(true);mocks.setting.mockResolvedValue('');});
 it('retains complete guide and offers three tabs',async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
  for(const text of ['دليل الاستخدام','شرح متحرك','لقطات توضيحية','/admin/guide',...HELP_STEPS.map(s=>s.href)])expect(html).toContain(text);
 });
 it('starts the tour paused',async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({tab:'tour'})}));
  expect(html).toContain('aria-label="تشغيل"');expect(html).not.toContain('aria-label="إيقاف"');
 });
 it('does not expose category help without view permission',async()=>{
  mocks.permission.mockResolvedValue(false);
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({tab:'shots'})}));
  expect(html).not.toContain('/help/categories/');
 });
 it('requires staff authentication',async()=>{
  mocks.auth.mockRejectedValue(new Error('denied'));
  await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('denied');
 });
 it('escapes editable captions and honors the disable flag',async()=>{
  mocks.setting.mockResolvedValue(JSON.stringify({enabled:true,captions:HELP_STEPS.map(()=>'<script>alert(1)</script>')}));
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
  expect(html).not.toContain('<script>alert');expect(html).toContain('&lt;script&gt;');
  mocks.setting.mockResolvedValue(JSON.stringify({enabled:false,captions:HELP_STEPS.map(s=>s.caption)}));
  expect(renderToStaticMarkup(await Page({searchParams:Promise.resolve({tab:'tour'})}))).not.toContain('aria-label="تشغيل"');
 });
});
