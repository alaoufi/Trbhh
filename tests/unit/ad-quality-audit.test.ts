import {describe, expect, it} from 'vitest';
import {auditAdQuality, invalidSubcategoryReason, summarizeAdQualityAudit, type AuditableAd} from '@/lib/ad-quality/audit';
import type {CategoryField} from '@/lib/ad-categories/validation';

const liftingFields:CategoryField[]=[
  {key:'capacity_t',label:'حمولة الرفع المقننة',type:'decimal',group:'المواصفات',required:false,visible:true,order:1,options:[],min:0.1,max:2000,step:0.1,unit:'طن'},
];
const base:AuditableAd={
  id:1,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,
  regionId:1,cityId:10,locationValid:true,title:'سليم',price:100,oldPrice:0,
  listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{},
};

describe('legacy ad quality audit',()=>{
  it('classifies impossible stored values without mutating them',()=>{
    const values={capacity_t:6400};
    const issues=auditAdQuality({
      id:3420,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,
      regionId:1,cityId:10,locationValid:true,title:'كرين للإيجار',price:68,oldPrice:800,
      listingType:'sale',priceType:'rent',rentPeriod:'شهري',fields:liftingFields,values,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'impossible_field_range',classification:'INVALID_BUT_PRESERVE',fieldKey:'capacity_t'}),
      expect.objectContaining({code:'listing_price_mismatch',classification:'NEEDS_REVIEW'}),
      expect.objectContaining({code:'suspicious_discount',classification:'NEEDS_REVIEW'}),
    ]));
    expect(values).toEqual({capacity_t:6400});
  });

  it('separates safe normalization from manual review and preserved invalid data',()=>{
    const rows=[
      {id:1,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,regionId:1,cityId:10,locationValid:true,title:'سليم',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
      {id:2,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,regionId:1,cityId:null,locationValid:false,title:'موقع ناقص',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
      {id:3,categoryId:null,subcategoryId:null,categoryValid:false,subcategoryValid:false,regionId:1,cityId:10,locationValid:true,title:'بلا قسم',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
    ];
    expect(summarizeAdQualityAudit(rows)).toMatchObject({records:3,clean:1,AUTO_FIX_SAFE:0,NEEDS_REVIEW:1,INVALID_BUT_PRESERVE:1});
  });

  it('separates the factual causes hidden behind invalid_subcategory',()=>{
    expect(invalidSubcategoryReason({...base,subcategoryId:null,subcategoryValid:false})).toBe('subcategory_missing');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:false})).toBe('subcategory_not_found');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:true,subcategoryActive:false})).toBe('legacy_id');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:false,duplicateCategory:true})).toBe('duplicate_category');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:false,categoryRemapTargetId:9})).toBe('category_remapped');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:true,leafSemanticallyValid:false})).toBe('ad_points_to_wrong_leaf');
    expect(invalidSubcategoryReason({...base,subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:false})).toBe('parent_child_mismatch');
  });

  it('distinguishes public blockers from safely preserved and editorial legacy data',()=>{
    const field:CategoryField={key:'material',label:'المادة',type:'select',group:'المواصفات',required:false,visible:true,order:1,options:['خشب']};
    const issues=auditAdQuality({...base,
      subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:false,
      locationValid:false,locationExcludedFromGeo:true,
      fields:[field],values:{material:'خشب',removed:'قديم'},publicFieldsSuppressed:true,publicTaxonomySuppressed:true,
      price:100,oldPrice:1000,
    });
    expect(issues.find(issue=>issue.code==='invalid_subcategory')).toMatchObject({impact:'NEEDS_EDITOR_REVIEW',reason:'parent_child_mismatch'});
    expect(issues.find(issue=>issue.code==='missing_or_mismatched_location')).toMatchObject({impact:'SAFE_LEGACY'});
    expect(issues.find(issue=>issue.code==='field_not_in_category')).toMatchObject({impact:'SAFE_LEGACY'});
    expect(issues.find(issue=>issue.code==='suspicious_discount')).toMatchObject({impact:'EDITORIAL_ONLY'});
    expect(summarizeAdQualityAudit([{...base,subcategoryValid:false,subcategoryExists:true,subcategoryParentMatches:false,publicTaxonomySuppressed:true}])).toMatchObject({
      impacts:{BLOCKING_PUBLIC:0,SAFE_LEGACY:0,EDITORIAL_ONLY:0,NEEDS_EDITOR_REVIEW:1},
      subcategoryReasons:{parent_child_mismatch:1},
    });
  });
});
