import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.stubGlobal('React',React);
vi.mock('@/lib/access-control/guards',()=>({requireAdminPage:async()=>({uid:1}),readActorAccess:async()=>({keys:new Set(['categories:view'])})}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/lib/ad-categories/service',()=>({getCategoryFormConfig:async()=>({enabled:true,labels:{},categories:[{id:1,name:'الأول',active:true,order:1},{id:2,name:'الثاني',active:false,order:2}],subcategories:[{id:3,name:'فرع فعلي',categoryId:1,active:true,order:0,version:1,kind:'goods',priceEnabled:true,goodsEnabled:false,fields:[{key:'color',label:'اللون',type:'text',visible:true,required:false,order:0,group:'',options:[]}]}]})}));
vi.mock('@/app/admin/categories/actions',()=>({saveCategory:vi.fn(),saveCategorySettings:vi.fn(),saveSubcategory:vi.fn(),toggleCategory:vi.fn(),autosaveCategoryFields:vi.fn()}));
import Page from '@/app/admin/categories/page';
it('offers a choice rather than expanding every category on management entry',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view:'manage'})}));expect(html).toContain('اختر قسماً قائماً لإدارته');expect(html).not.toContain('(#1)');expect(html).not.toContain('(#2)');expect(html).toContain('إضافة قسم رئيسي جديد');
});
it('expands only the requested category and retains other choices in the selector',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view:'manage',category:'2'})}));expect(html).toContain('(#2)');expect(html).not.toContain('(#1)');expect(html).toContain('الأول');expect(html).toContain('الثاني');
});

it('opens the actual field definition editor, not the flags editor',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({sub:'3',section:'fields'})}));
 expect(html).toContain('المعرف الثابت');expect(html).toContain('إضافة حقل');expect(html).toContain('حفظ القسم الفرعي');expect(html).not.toContain('التعديل يُحفظ تلقائياً');
});
it('opens the actual autosaving flags editor without field creation controls',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({sub:'3',section:'requirements'})}));
 expect(html).toContain('التعديل يُحفظ تلقائياً');expect(html).toContain('ظهور اللون color');expect(html).toContain('إلزام اللون color');expect(html).not.toContain('المعرف الثابت');expect(html).not.toContain('حفظ القسم الفرعي');
});
