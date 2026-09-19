import {describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/components/search-suggest',()=>({SearchSuggestInput:()=>null}));
import {PublicSearchForm} from '@/components/public-search-form';
import {sandboxCatalogOptions} from '@/lib/sandbox-catalog';

describe('sandbox public browse form',()=>{
  it('renders catalog dropdowns with stable labels, selected names and the home GET target',()=>{
    const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[],action:'/',compact:true,categories:sandboxCatalogOptions,params:{category:'أخرى',subcategory:'كتب',sort:'price_desc',special:'1'}}));
    expect(html).toContain('action="/"');expect(html).toContain('method="get"');
    expect(html).toMatch(/<select aria-label="القسم الرئيسي" name="category"/);
    expect(html).toMatch(/<select aria-label="القسم الفرعي" name="subcategory"/);
    expect(html).toContain('<option value="أخرى" selected="">');
    expect(html).toContain('<option value="كتب" selected="">');
    expect(html).toContain('name="sort" value="price_desc"');
    expect(html).toContain('name="special" value="1"');
    expect(html).not.toContain('name="page"');
  });
  it('default production form has no category selects and still submits to search',()=>{
    const html=renderToStaticMarkup(createElement(PublicSearchForm,{regions:[],areas:[]}));
    expect(html).toContain('action="/search"');
    expect(html).not.toContain('name="category"');expect(html).not.toContain('name="subcategory"');
  });
});
