import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PublicSearchForm} from '@/components/public-search-form';
it('preserves GET search, selected scope and filter values in the compact inline row',()=>{
 const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[],compact:true,inline:true,params:{category:'12',special:'1',q:'car',minPrice:'50',maxPrice:'100',type:'offer'},inlineAction:createElement('a',{href:'/ads/new'},'Add')}));
 expect(html).toContain('action="/search"');
 expect(html).toContain('method="get"');
 for(const name of ['category','special','q','minPrice','maxPrice','type']) expect(html).toContain('name="'+name+'"');
 expect(html).toContain('value="50"');
 expect(html).toContain('value="100"');
 expect(html).toContain('<details');
 expect(html).not.toContain('<details open');
 expect(html).toContain('href="/ads/new"');
});
it('keeps price filters disabled when the existing price flag is off',()=>{
 const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[],compact:true,inline:true,priceOn:false}));
 expect(html).not.toContain('name="minPrice"');
 expect(html).not.toContain('name="maxPrice"');
 expect(html).toContain('name="type"');
});
it('keeps the existing expanded form as the default for other pages',()=>{
 const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[]}));
 expect(html).toContain('name="sort"');
 expect(html).not.toContain('<details');
});
