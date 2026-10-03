import {describe,it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';
import {isCategoryEditorSection,type CategoryEditorSection} from '@/lib/ad-categories/admin-presentation';
vi.stubGlobal('React',React);
const initial:SubcategoryOption={id:8,categoryId:2,name:'معدات',active:true,order:1,version:4,kind:'goods',priceEnabled:true,goodsEnabled:false,fields:[{key:'capacity',label:'الحمولة',type:'number',group:'المواصفات',required:true,visible:true,order:1,options:[],unit:'طن',min:0,searchable:true,filterable:true}]};
const render=(section:CategoryEditorSection)=>renderToStaticMarkup(React.createElement(AdCategoryEditor,{initial,categoryId:2,action:async()=>{},section}));
describe('focused category field administration',()=>{
  it('only removes a requirement condition when explicitly changing it to optional',async()=>{
    const {changeFieldRequirement}=await import('@/lib/ad-categories/admin-presentation');
    const conditional={...initial.fields[0],required:false,dependsOn:'listing_type',conditionEffect:'require' as const,dependencyOperator:'equals' as const,dependencyValue:'rent'};
    const optional=changeFieldRequirement(conditional,'optional');
    expect(optional.required).toBe(false);expect(optional.dependsOn).toBeUndefined();expect(optional.visible).toBe(true);expect(optional.unit).toBe('طن');
    const show={...conditional,conditionEffect:'show' as const};
    expect(changeFieldRequirement(show,'optional')).toEqual(show);
    expect(changeFieldRequirement(show,'required')).toEqual({...show,required:true});
    expect(changeFieldRequirement(conditional,'conditional')).toEqual(conditional);
  });
  it('requirements page contains explicit requirement choices without field construction controls',()=>{
    const html=render('requirements');
    expect(html).toContain('إجباري — يجب تعبئته');
    expect(html).toContain('اختياري — يمكن تركه فارغًا');
    expect(html).not.toContain('المعرف الثابت');
    expect(html).not.toContain('قالب الحقول');
    expect(html).not.toContain('مطلوب عند الظهور');
  });
  it('display page explains every switch and does not offer removal or required editing',()=>{
    const html=render('display');
    for(const label of ['إظهار الحقل في نموذج إضافة وتعديل الإعلان','استخدام القيمة في البحث النصي','إتاحة الحقل ضمن فلاتر البحث','عرض الحقل عند مقارنة الإعلانات','عرض القيمة في بطاقة الإعلان المختصرة','عرض القيمة في صفحة تفاصيل الإعلان'])expect(html).toContain(label);
    expect(html).not.toContain('إزالة من التعريف');
    expect(html).not.toContain('إجباري — يجب تعبئته');
  });
  it('field construction links to focused settings instead of crowding switches',()=>{
    const html=render('fields');expect(html).toContain('المعرف الثابت');expect(html).toContain('إضافة حقل');
    expect(html).not.toContain('مطلوب عند الظهور');
    expect(html).toContain('/admin/categories/subcategories/8/requirements');
  });
  it('accepts only local known editor sections',()=>{for(const value of ['__proto__','constructor','//example.com','unknown',null])expect(isCategoryEditorSection(value)).toBe(false);expect(isCategoryEditorSection('requirements')).toBe(true);});
  it.each(['fields','requirements','display'] as const)('keeps full original definition and version in %s form',section=>{
    const html=render(section);
    expect(html).toContain('name="version" value="4"');
    const serialized=html.match(/name="fields_json" value="([^"]*)"/)?.[1]?.replaceAll('&quot;','"').replaceAll('&amp;','&');
    expect(JSON.parse(serialized!)).toEqual(initial.fields);
    expect(html).toContain(`name="editor_section" value="${section}"`);
  });
});
