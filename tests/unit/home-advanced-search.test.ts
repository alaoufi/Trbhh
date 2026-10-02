import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PublicSearchForm} from '@/components/public-search-form';

it('renders homepage advanced controls collapsed on the server even with selected values',()=>{
  const html=renderToStaticMarkup(createElement(PublicSearchForm,{compact:true,regions:[],areas:[],params:{q:'معدات',minPrice:'150',type:'offer'}}));
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('inert=""');
  expect(html).toContain('بحث متقدم');
  expect(html).toContain('name="q"');
  expect(html).toContain('value="150"');
  expect(html).toContain('action="/search"');
});

it('keeps the full search page filters available',()=>{
  const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[]}));
  expect(html).not.toContain('inert=');
  expect(html).not.toContain('aria-expanded=');
  for(const name of ['city','area','type','minPrice','maxPrice','sort'])expect(html).toContain(`name="${name}"`);
});
