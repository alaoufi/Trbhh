import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SupplierOnboarding} from '@/components/supplier-onboarding';

describe('supplier onboarding authorization handoff',()=>{
 it('labels Excel as an optional fallback because the supplier data link is primary',()=>{const noop=async()=>({errors:[],warnings:[]});const html=renderToStaticMarkup(createElement(SupplierOnboarding,{previewAction:noop,saveAction:noop}));expect(html).toContain('خيار احتياطي');expect(html).toContain('رابط بيانات المورد');});
 it('shows the ready-to-share Salla authorization link immediately after saving',()=>{
  const noop=async()=>({errors:[],warnings:[]});
  const html=renderToStaticMarkup(createElement(SupplierOnboarding,{previewAction:noop,saveAction:noop,initialState:{errors:[],warnings:[],saved:{supplierId:'7',storeName:'متجر الاختبار',connected:false,status:'pending',authorizationUrl:'https://trbhh.sa/api/integrations/salla/authorize?invite=signed-token',authorizationExpiresAt:'2026-09-22T10:00:00.000Z'}}}));
  expect(html).toContain('رابط تفويض متجر سلة');
  expect(html).toContain('invite=signed-token');
  expect(html).toContain('نسخ الرابط');
 });
 it('explains that an already connected store does not need another authorization link',()=>{const noop=async()=>({errors:[],warnings:[]});const html=renderToStaticMarkup(createElement(SupplierOnboarding,{previewAction:noop,saveAction:noop,initialState:{errors:[],warnings:[],saved:{supplierId:'1',storeName:'شعبيات الأولين',connected:true,status:'ready'}}}));expect(html).toContain('متصل بالفعل');expect(html).toContain('لا يحتاج رابط تفويض جديد');});
});
