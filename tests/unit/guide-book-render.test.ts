import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
const flags=vi.hoisted(()=>({enabled:true}));
vi.mock('@/lib/settings',()=>({getSettingBool:async()=>flags.enabled}));
import {GuideView} from '@/components/guide-view';
import {BookOpen} from 'lucide-react';
Object.assign(globalThis,{React});
const props={topId:'admin-guide-top',headerIcon:BookOpen,title:'دليل الإدارة',subtitle:'شرح الاستخدام',sections:[{id:'category-admin-hub',title:'الأقسام',goal:'إدارة الأقسام',steps:['تعليمات محفوظة'],icon:BookOpen,from:'#16294a',to:'#234768'},{id:'second',title:'موضوع ثان',goal:'المزيد',steps:['محتوى ثان محفوظ'],icon:BookOpen,from:'#16294a',to:'#234768'}]};
describe('guide renderer',()=>{
 it('preserves every chapter and shortcut in server HTML before hydration',async()=>{
  flags.enabled=true;
  const html=renderToStaticMarkup(await GuideView({...props,children:React.createElement('a',{href:'/guide'},'اختصار محفوظ')}));
  expect(html).toContain('data-guide-book');expect(html).toContain('تعليمات محفوظة');expect(html).toContain('محتوى ثان محفوظ');expect(html).toContain('id="second"');expect(html).not.toContain('hidden=""');expect(html).toContain('اختصار محفوظ');expect(html).toContain('/help/categories/manage.webp');
 });
 it('does not expose admin illustrations to the member reader',async()=>{
  flags.enabled=true;
  expect(renderToStaticMarkup(await GuideView({...props,topId:'guide-top'}))).not.toContain('/help/categories/');
 });
 it('retains the classic renderer when disabled by administration',async()=>{
  flags.enabled=false;
  const html=renderToStaticMarkup(await GuideView(props));
  expect(html).not.toContain('data-guide-book');expect(html).toContain('تعليمات محفوظة');expect(html).toContain('id="second"');
 });
});
