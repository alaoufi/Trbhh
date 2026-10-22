import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {CategoryAdminNavigation} from '@/components/category-admin-navigation';
import {CategoryFieldPicker} from '@/components/category-field-picker';
import {isCategoryAdminView} from '@/lib/ad-categories/admin-navigation';
vi.stubGlobal('React',React);
const categories=[{id:1,name:'القسم الأول'},{id:2,name:'القسم الثاني'}];
const subs=[{id:3,name:'الفرع',categoryId:1,fields:[]}];
it('has one combined flags task and a separate definition editor',()=>{
 const html=renderToStaticMarkup(React.createElement(CategoryAdminNavigation,{home:true}));
 expect(html).toContain('view=fields');expect(html).toContain('view=requirements');expect(html).not.toContain('view=display');expect(html).toContain('الظهور والإلزام');expect(isCategoryAdminView('display')).toBe(true);
});
it('does not send field creation into the bulk flags editor',()=>{
 const html=renderToStaticMarkup(React.createElement(CategoryFieldPicker,{categories,subcategories:subs,section:'fields',initialCategory:1,initialSubcategory:3}));
 expect(html).not.toContain('scope=parent');expect(html).toContain('sub=3&amp;section=fields');expect(html).toContain('view=manage&amp;category=1');expect(html).not.toContain('<option value="new"');
});
it('offers bulk flags and child exception from the combined task',()=>{
 const html=renderToStaticMarkup(React.createElement(CategoryFieldPicker,{categories,subcategories:subs,section:'requirements',initialCategory:1,initialSubcategory:3}));
 expect(html).toContain('scope=parent');expect(html).toContain('sub=3&amp;section=requirements');
});
