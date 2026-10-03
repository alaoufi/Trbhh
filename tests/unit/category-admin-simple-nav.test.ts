import {it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.stubGlobal('React',React);
it('puts six direct permission-filtered pages under one category menu in both navigation surfaces',async()=>{
  const {ADMIN_GROUPS,ADMIN_NAV}=await import('@/components/admin-nav-def');
  const group=ADMIN_GROUPS.find(g=>g.title==='الأقسام وحقولها');
  expect(group).toBeDefined();
  expect(group!.items.map(i=>i.href)).toEqual(['manage','ads','fields','requirements','display','settings'].map(p=>`/admin/categories/${p}`));
  expect(group!.items.every(i=>i.perm==='categories')).toBe(true);
  expect(ADMIN_NAV.filter(i=>i.href.startsWith('/admin/categories'))).toHaveLength(6);
});
it('collapses repeated in-page navigation while keeping the landing shortcuts available',async()=>{
  const {CategoryAdminNavigation}=await import('@/components/category-admin-navigation');
  const html=renderToStaticMarkup(React.createElement(CategoryAdminNavigation,{current:'fields'}));
  expect(html).toContain('<details');expect(html).not.toContain(' open=');
  expect(html).toContain('انتقل إلى صفحة أخرى');
  expect(html).toContain('/admin/categories/requirements');
  expect(renderToStaticMarkup(React.createElement(CategoryAdminNavigation,{home:true}))).not.toContain('<details');
});
it('supports separate requirement and display selectors without relaxing route validation',async()=>{
  const {isCategoryAdminView}=await import('@/lib/ad-categories/admin-navigation');
  expect(isCategoryAdminView('requirements')).toBe(true);
  expect(isCategoryAdminView('display')).toBe(true);
  expect(isCategoryAdminView('__proto__')).toBe(false);
});
it('starts with a disabled subcategory and no editor, and opens only a compatible selected subcategory',async()=>{
  const {CategoryFieldPicker}=await import('@/components/category-field-picker');
  const props={categories:[{id:1,name:'معدات'},{id:2,name:'أثاث'}],subcategories:[{id:4,name:'رافعات',categoryId:1}],section:'requirements' as const,initialCategory:null,initialSubcategory:null};
  const empty=renderToStaticMarkup(React.createElement(CategoryFieldPicker,props));
  expect(empty).toContain('disabled');expect(empty).not.toContain('href=');expect(empty).not.toContain('fields_json');
  const selected=renderToStaticMarkup(React.createElement(CategoryFieldPicker,{...props,initialCategory:1,initialSubcategory:4}));
  expect(selected).toContain('/admin/categories/subcategories/4/requirements');
  const incompatible=renderToStaticMarkup(React.createElement(CategoryFieldPicker,{...props,initialCategory:2,initialSubcategory:4}));
  expect(incompatible).not.toContain('href=');
});
