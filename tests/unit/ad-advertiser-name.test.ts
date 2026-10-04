import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {AdCard,AdCardShop,AdCardList,AdCardMarketplace} from '@/components/ad-card';
import type {AdCard as Card} from '@/lib/data';
Object.assign(globalThis,{React});
const ad:Card={id:1,title:'إعلان اختبار',price:100,adsType:'offer',image:'/placeholder.svg',cityName:null,categoryName:null,createdAt:null,special:false,urgent:false,views:0,sellerName:'أبو ماجد',sellerTrusted:false};
describe('visible advertiser on all card templates',()=>{
 for(const Component of [AdCard,AdCardShop,AdCardList,AdCardMarketplace]){
  it(Component.name+' exposes a labelled personal advertiser',()=>{
   const html=renderToStaticMarkup(React.createElement(Component,{ad}));
   expect(html).toContain('data-advertiser-name');expect(html).toContain('المعلن:');expect(html).toContain('أبو ماجد');
  });
  it(Component.name+' uses the store identity for a store placement',()=>{
   const html=renderToStaticMarkup(React.createElement(Component,{ad:{...ad,storeName:'متجر الاختبار'}}));
   const name=html.match(/data-advertiser-name[^>]*>(.*?)<\/span>/s)?.[1]||'';
   expect(name).toContain('متجر الاختبار');expect(name).not.toContain('أبو ماجد');
  });
 }
});
