import {describe,expect,it} from 'vitest';
import {buildEditorReviewRow} from '@/lib/ad-quality/editor-review';

const base={
  id:3420,title:'رافعة شوكية للإيجار',categoryName:'نقليات ومعدات ثقيلة',categoryActive:true,
  subcategoryName:'رافعات ومناولة',subcategoryActive:true,subcategoryParentMatches:true,
  templateKey:'lifting',values:{equipment_kind:'رافعة مقصية',capacity_t:640},knownFieldKeys:['equipment_kind','forklift_capacity_t'],
  cityName:'الرياض',areaName:'الرياض',locationMatches:true,
};

describe('editor review projection',()=>{
  it('keeps ambiguous taxonomy as human review without inventing a suggestion',()=>{
    const row=buildEditorReviewRow(base)!;
    expect(row).toMatchObject({adId:3420,disposition:'NEEDS_EDITOR_REVIEW',suggestedCategory:null,locationStatus:'valid'});
    expect(row.reasons).toContain('نوع المعدة لا يطابق عنوان الإعلان');
    expect(row.legacyFieldKeys).toEqual(['capacity_t']);
  });

  it('reports parent mismatch and excludes invalid geography from nearby',()=>{
    const row=buildEditorReviewRow({...base,id:3412,title:'مقاول تركيب شبوك',templateKey:'sanitary',subcategoryParentMatches:false,cityName:null,areaName:null,locationMatches:false,values:{service_kind:'تركيب'},knownFieldKeys:[]})!;
    expect(row.reasons).toEqual(expect.arrayContaining(['القسم الفرعي لا يتبع القسم الحالي','التصنيف الحالي لا يطابق محتوى الإعلان']));
    expect(row.locationStatus).toBe('excluded_from_nearby');
    expect(row.legacyFieldKeys).toEqual(['service_kind']);
  });

  it('returns null for a clean reviewed record',()=>{
    expect(buildEditorReviewRow({...base,title:'رافعة شوكية للإيجار',values:{equipment_kind:'رافعة شوكية',forklift_capacity_t:3}})).toBeNull();
  });
});
