import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SupplierOnboarding} from '@/components/supplier-onboarding';

describe('supplier onboarding authorization handoff',()=>{
 it('shows the ready-to-share Salla authorization link immediately after saving',()=>{
  const noop=async()=>({errors:[],warnings:[]});
  const html=renderToStaticMarkup(createElement(SupplierOnboarding,{previewAction:noop,saveAction:noop,initialState:{errors:[],warnings:[],saved:{supplierId:'7',storeName:'متجر الاختبار',connected:false,status:'pending',authorizationUrl:'https://trbhh.sa/api/integrations/salla/authorize?invite=signed-token',authorizationExpiresAt:'2026-09-22T10:00:00.000Z'}}}));
  expect(html).toContain('رابط تفويض متجر سلة');
  expect(html).toContain('invite=signed-token');
  expect(html).toContain('نسخ الرابط');
 });
});
