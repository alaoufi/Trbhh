import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({allowed:true,entities:vi.fn(async()=>[]),drafts:vi.fn(async()=>[]),config:vi.fn(async()=>({categories:[{id:1,name:'قسم فعلي غير تجريبي'}],subcategories:[{id:2,name:'فرع كامل',categoryId:1,fields:[]}]}))}));
vi.stubGlobal('React',React);
vi.mock('@/lib/access-control/guards',()=>({requireAdminPage:async()=>({uid:1}),hasAccess:async()=>f.allowed}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/lib/ad-categories/service',()=>({getCategoryFormConfig:f.config}));
vi.mock('@/lib/dynamic-ads/repository',()=>({listDynamicEntities:f.entities,listDynamicAdminDrafts:f.drafts}));
vi.mock('@/lib/settings',()=>({getSettingBool:async()=>false}));
vi.mock('@/app/admin/smart-ads/actions',()=>({setSmartAdsLabEnabledAction:vi.fn()}));
import Page from '@/app/admin/smart-ads/page';
beforeEach(()=>{vi.clearAllMocks();f.allowed=true;});
it('shows real categories by default without initializing the experimental repository',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(html).toContain('قسم فعلي غير تجريبي');expect(html).toContain('فتح أدوات المختبر');expect(html).toContain('بلا حقول مخصصة');expect(f.config).toHaveBeenCalledWith(true);expect(f.entities).not.toHaveBeenCalled();expect(f.drafts).not.toHaveBeenCalled();
});
it('loads the lab only when explicitly opened',async()=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({lab:'1'})}));expect(html).toContain('قوالب الاختبار ومجموعات حقولها');expect(f.entities).toHaveBeenCalledTimes(1);expect(f.drafts).toHaveBeenCalledTimes(1);
});
it('does not expose real category definitions without category view access',async()=>{
 f.allowed=false;const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));expect(html).toContain('تحتاج صلاحية');expect(html).not.toContain('قسم فعلي غير تجريبي');expect(f.config).not.toHaveBeenCalled();
});
