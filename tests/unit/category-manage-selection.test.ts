import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.stubGlobal('React',React);
vi.mock('@/lib/access-control/guards',()=>({requireAdminPage:async()=>({uid:1}),readActorAccess:async()=>({keys:new Set(['categories:view'])})}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:()=>null}));
vi.mock('@/lib/ad-categories/service',()=>({getCategoryFormConfig:async()=>({enabled:true,labels:{},categories:[{id:1,name:'الأول',active:true,order:1},{id:2,name:'الثاني',active:false,order:2}],subcategories:[]})}));
vi.mock('@/app/admin/categories/actions',()=>({saveCategory:vi.fn(),saveCategorySettings:vi.fn(),saveSubcategory:vi.fn(),toggleCategory:vi.fn(),autosaveCategoryFields:vi.fn()}));
import Page from '@/app/admin/categories/page';
it('offers a choice rather than expanding every category on management entry',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view:'manage'})}));expect(html).toContain('اختر قسماً قائماً لإدارته');expect(html).not.toContain('(#1)');expect(html).not.toContain('(#2)');expect(html).toContain('إضافة قسم رئيسي جديد');
});
it('expands only the requested category and retains other choices in the selector',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view:'manage',category:'2'})}));expect(html).toContain('(#2)');expect(html).not.toContain('(#1)');expect(html).toContain('الأول');expect(html).toContain('الثاني');
});
