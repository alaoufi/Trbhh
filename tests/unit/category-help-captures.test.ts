import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {CategoryAdminWorkspace} from '@/app/admin/categories/workspace';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import {CATEGORY_LABELS,type SubcategoryOption} from '@/lib/ad-categories/contracts';
import {HELP_STEPS} from '@/lib/category-help';
Object.assign(globalThis,{React});
vi.mock('@/app/admin/categories/actions',()=>({saveCategory:async()=>{},saveCategorySettings:async()=>{},saveSubcategory:async()=>{},toggleCategory:async()=>{}}));
vi.mock('@/lib/prisma',()=>({prisma:{ads:{findMany:async()=>[]}}}));
vi.mock('@/lib/ad-categories/service',()=>({getCategoryFormConfig:async()=>({enabled:true,categories:[{id:1,name:'معدات — مثال تعليمي',active:true,order:0}],subcategories:[sample],labels:CATEGORY_LABELS})}));
const sample:SubcategoryOption={id:2,categoryId:1,name:'رافعات ومناولة — مثال تعليمي',active:true,order:0,version:1,kind:'goods',priceEnabled:true,goodsEnabled:false,fields:[{key:'capacity',label:'حمولة المعدة',type:'number',group:'المواصفات',required:true,visible:true,order:0,options:[],unit:'طن',min:0,searchable:false,filterable:true,showInDetails:true},{key:'notes',label:'ملاحظات إضافية',type:'text',group:'المواصفات',required:false,visible:true,order:1,options:[],showInDetails:true}]};
describe('real category components with synthetic data',()=>{
 for(const s of HELP_STEPS)it(s.key,async()=>{
  const editor=['fields','requirements','display'].includes(s.key);
  const element=editor?React.createElement(AdCategoryEditor,{initial:sample,categoryId:1,section:s.key as 'fields'|'requirements'|'display',action:async()=>{}}):await CategoryAdminWorkspace({view:s.key as 'manage'|'ads'|'settings',query:{category:'1',subcategory:s.key==='ads'?'2':undefined}});
  const html=renderToStaticMarkup(element);
  expect(html).not.toContain('undefined');expect(html).toContain('<form');
  if(process.env.CAPTURE_CATEGORY_HELP==='1'){
   mkdirSync('artifacts/category-help',{recursive:true});
   writeFileSync(`artifacts/category-help/${s.key}.html`,`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="--font-cairo:Tahoma;font-family:Tahoma;background:white"><main style="padding:16px"><p style="background:#fef3c7;padding:12px">${s.title} — بيانات تعليمية فقط</p>${html}</main></body></html>`);
  }
 });
});
