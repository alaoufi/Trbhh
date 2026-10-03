import {it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.stubGlobal('React',React);
it('offers separate mobile administration destinations with clear Arabic titles',async()=>{
  const {CategoryAdminNavigation}=await import('@/components/category-admin-navigation');
  const html=renderToStaticMarkup(React.createElement(CategoryAdminNavigation,{home:true}));
  for(const route of ['ads','manage','fields','settings'])expect(html).toContain(`/admin/categories/${route}`);
  for(const label of ['إعلانات الأقسام','إضافة حقول الأقسام وإدارتها','إضافة وتعديل وإظهار وإخفاء الأقسام'])expect(html).toContain(label);
  expect(html).toContain('min-h-11');expect(html).not.toContain('<table');
});
it('rejects invented sections and bounds pagination/filter ids',async()=>{
  const {isCategoryAdminView,categoryAdminQuery}=await import('@/lib/ad-categories/admin-navigation');
  expect(isCategoryAdminView('__proto__')).toBe(false);expect(isCategoryAdminView('//evil')).toBe(false);
  expect(isCategoryAdminView('manage')).toBe(true);
  expect(categoryAdminQuery({page:'-1',category:'2.5',subcategory:'Infinity'})).toMatchObject({page:1,category:null,subcategory:null,invalid:true});
  expect(categoryAdminQuery({page:'2',category:'12',subcategory:'34'})).toMatchObject({page:2,category:12,subcategory:34,invalid:false});
  expect(categoryAdminQuery({page:'99999999'}).page).toBe(100000);
});
