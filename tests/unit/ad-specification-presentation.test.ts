import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {AdCategorySummary} from '@/components/ad-category-summary';
import {AdCardList} from '@/components/ad-card';
import type {AdCard} from '@/lib/data';
import {formatAdSpecification,adPriceLabel} from '@/lib/ad-presentation';
import {mkdirSync,writeFileSync} from 'node:fs';
vi.stubGlobal('React',React);
const fields=[
 {key:'empty',label:'فارغ',group:'مجموعة فارغة',value:''},
 {key:'capacity',label:'الحمولة',group:'المواصفات',value:{min:1,max:3},unit:'طن'},
 {key:'hours',label:'ساعات التشغيل',group:'المواصفات',value:0},
 {key:'operator',label:'مع مشغل',group:'المواصفات',value:false},
 {key:'hidden',label:'الرابعة',group:'المواصفات',value:'قيمة رابعة'},
];
describe('ad specification presentation',()=>{
 it.each([null,undefined,NaN,Infinity,{},[],[' ',''],{min:3,max:1},{min:0,max:Infinity}])('omits invalid or empty display value %j',value=>expect(formatAdSpecification(value)).toBe(''));
 it('preserves rental units without assigning time units to sale',()=>{
  expect(adPriceLabel({price:100,priceType:'rent',rentPeriod:'بالساعة'})).toBe('100 ر.س / ساعة');
  expect(adPriceLabel({price:100,priceType:'sale',rentPeriod:'بالساعة'})).toBe('100 ر.س');
 });
 it('renders structured range values instead of object strings',()=>{
  const html=renderToStaticMarkup(React.createElement(AdCategorySummary,{fields}));
  expect(html).toContain('1–3');expect(html).toContain('طن');
  expect(html).not.toContain('[object Object]');expect(html).not.toContain('مجموعة فارغة');
 });
 it('does not display empty or incomplete ranges',()=>{
  const html=renderToStaticMarkup(React.createElement(AdCategorySummary,{fields:[
   {key:'empty',label:'نطاق فارغ',group:'فارغ',value:{min:'',max:''}},
   {key:'partial',label:'ناقص',group:'فارغ',value:{min:1,max:''}},
  ]}));expect(html).toBe('');
 });
 it('shows first three populated schema-selected facts, preserving false and zero',()=>{
  const ad={id:1,title:'رافعة اختبار',price:100,priceType:'sale',image:'/placeholder.svg',views:0,createdAt:null,categoryCardFields:fields} as AdCard;
  const html=renderToStaticMarkup(React.createElement(AdCardList,{ad}));
  expect(html).not.toContain('فارغ:');expect(html).toContain('الحمولة');expect(html).toContain('ساعات التشغيل');expect(html).toContain('مع مشغل');expect(html).toContain('لا');expect(html).not.toContain('قيمة رابعة');
 });
});

// Opt-in static fixture of real components; no database or production requests.
if(process.env.AD_SPEC_VISUAL==='1') {
 const ad={id:1,title:'رافعة شوكية تجريبية',price:100,priceType:'rent',rentPeriod:'بالساعة',image:'/test-image.svg',sellerName:'معلن تجريبي',cityName:'الرياض',views:0,createdAt:null,categoryCardFields:fields} as AdCard;
 mkdirSync('artifacts/ad-specifications',{recursive:true});
 writeFileSync('artifacts/ad-specifications/fixture.html',renderToStaticMarkup(React.createElement('main',{style:{maxWidth:900,margin:'auto',padding:16}},React.createElement(AdCardList,{ad}),React.createElement('div',{style:{marginTop:16}},React.createElement(AdCategorySummary,{fields})))));
}
