import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdirSync,writeFileSync} from 'node:fs';
import {splitHomeFeed} from '@/lib/home-feed';
import {HomeCompactStrip} from '@/components/home-compact-strip';
import type {AdCard} from '@/lib/data';
vi.stubGlobal('React',React);
const ads=Array.from({length:6},(_,index)=>({id:index+1,title:['رافعة شوكية بحالة ممتازة','جلسة خارجية للحديقة','جهاز حاسب محمول','أدوات زراعية','مكيف سبليت موفر','دراجة رياضية'][index],price:1200+index*100,priceEnabled:index!==5,priceType:'sale',sellerName:'معلن تجريبي',cityName:'الرياض',image:'/test-image.svg',createdAt:null,views:0})) as AdCard[];
const render=()=>renderToStaticMarkup(React.createElement(HomeCompactStrip,{ads,title:'لمحة من السوق',hint:'تصفّح المزيد بالسحب أو التمرير'}));
it('renders smaller public cards once with controllable motion',()=>{
 const html=render();
 expect((html.match(/href="\/ads\//g)||[])).toHaveLength(6);
 expect(html).toContain('tabindex="0"');expect(html).toContain('overflow-x-auto');
 expect(html).toContain('المعلن: معلن تجريبي');expect(html).not.toContain('1,700');
 expect(html).toContain('w-32');expect(html).toContain('h-16');
 expect(html).toContain('إيقاف الحركة');
});
it('does not render an empty strip',()=>expect(renderToStaticMarkup(React.createElement(HomeCompactStrip,{ads:[],title:'عنوان',hint:'تلميح'}))).toBe(''));
it('keeps small feeds intact without empty strips',()=>{
 for(const count of [0,1,8,11]){
  const ads=Array.from({length:count},(_,id)=>({id}));
  expect(splitHomeFeed(ads)).toEqual({before:ads,strip:[],after:[]});
 }
});
if(process.env.HOME_STRIP_VISUAL==='1'){
 mkdirSync('artifacts/home-compact-strip',{recursive:true});
 writeFileSync('artifacts/home-compact-strip/fixture.html',`<main style="max-width:1100px;margin:auto;padding:16px">${render()}</main>`);
}
it('preserves priority order and every ad exactly once without mutating inputs',()=>{
 for(const count of [12,14,15,32]){
  const ads=Array.from({length:count},(_,id)=>({id}));const original=[...ads];
  const {before,strip,after}=splitHomeFeed(ads);
  expect(before).toHaveLength(6);expect(strip.length).toBeLessThanOrEqual(12);expect(after.length).toBeGreaterThanOrEqual(4);
  expect([...before,...strip,...after]).toEqual(original);expect(ads).toEqual(original);
 }
});
