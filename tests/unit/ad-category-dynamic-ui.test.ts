import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdListingPolicyFields} from '@/components/ad-listing-policy-fields';
import {AdCategoryFields} from '@/components/ad-category-fields';
import type {CategoryField} from '@/lib/ad-categories/validation';

vi.stubGlobal('React',React);
const policy={types:[
  {key:'sale' as const,label:'للبيع',pricing:['fixed' as const,'bidding' as const]},
  {key:'rent' as const,label:'للإيجار',pricing:['hour' as const,'day' as const,'month' as const]},
]};

it('never offers hourly pricing while sale is selected',()=>{
  const html=renderToStaticMarkup(React.createElement(AdListingPolicyFields,{policy,listingType:'sale',pricingMode:'fixed',onListingType:()=>{},onPricingMode:()=>{}}));
  expect(html).toContain('سعر محدد');expect(html).toContain('على السوم');expect(html).not.toContain('بالساعة');
});

it('offers rental units and requires a price for an hourly rental',()=>{
  const html=renderToStaticMarkup(React.createElement(AdListingPolicyFields,{policy,listingType:'rent',pricingMode:'hour',onListingType:()=>{},onPricingMode:()=>{}}));
  expect(html).toContain('بالساعة');expect(html).toContain('بالشهر');expect(html).toContain('name="price"');expect(html).toContain('required=""');
});

it('shows rental-only attributes only for rental listings',()=>{
  const fields:CategoryField[]=[{key:'operator',label:'يشمل المشغل',type:'boolean',group:'الإيجار',required:false,visible:true,order:1,options:[],dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent'}];
  const sale=renderToStaticMarkup(React.createElement(AdCategoryFields,{fields,values:{},listingType:'sale',onChange:()=>{}}));
  const rent=renderToStaticMarkup(React.createElement(AdCategoryFields,{fields,values:{},listingType:'rent',onChange:()=>{}}));
  expect(sale).not.toContain('يشمل المشغل');expect(rent).toContain('يشمل المشغل');
});

it('keeps required-if fields visible and marks them required only when the condition matches',()=>{
  const fields:CategoryField[]=[{key:'deposit',label:'التأمين',type:'number',group:'الإيجار',required:false,visible:true,order:1,options:[],dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent',conditionEffect:'require'}];
  const sale=renderToStaticMarkup(React.createElement(AdCategoryFields,{fields,values:{},listingType:'sale',onChange:()=>{}}));
  const rent=renderToStaticMarkup(React.createElement(AdCategoryFields,{fields,values:{},listingType:'rent',onChange:()=>{}}));
  expect(sale).toContain('التأمين');expect(sale).toContain('data-required="false"');expect(sale).not.toContain('required=""');
  expect(rent).toContain('التأمين');expect(rent).toContain('data-required="true"');expect(rent).toContain('required=""');
});
