import {CategoryValidationError, validateCategoryValues, type CategoryField, type CategoryValues} from '@/lib/ad-categories/validation';

export type AuditClassification='AUTO_FIX_SAFE'|'NEEDS_REVIEW'|'INVALID_BUT_PRESERVE';
export type AuditImpact='BLOCKING_PUBLIC'|'SAFE_LEGACY'|'EDITORIAL_ONLY'|'NEEDS_EDITOR_REVIEW';
export type InvalidSubcategoryReason='subcategory_missing'|'subcategory_not_found'|'legacy_id'|'duplicate_category'|'category_remapped'|'ad_points_to_wrong_leaf'|'parent_child_mismatch'|'other';
export type AuditIssue={code:string;classification:AuditClassification;impact:AuditImpact;fieldKey?:string;message:string;reason?:InvalidSubcategoryReason};
export type AuditableAd={
  id:number;categoryId:number|null;subcategoryId:number|null;categoryValid:boolean;subcategoryValid:boolean;
  regionId:number|null;cityId:number|null;locationValid:boolean;title:string;price:number;oldPrice:number;
  listingType:string|null;priceType:string|null;rentPeriod:string|null;fields:CategoryField[];values:CategoryValues;
  subcategoryExists?:boolean;subcategoryActive?:boolean;subcategoryParentMatches?:boolean;duplicateCategory?:boolean;
  categoryRemapTargetId?:number|null;leafSemanticallyValid?:boolean|null;locationExcludedFromGeo?:boolean;publicFieldsSuppressed?:boolean;
};

export function invalidSubcategoryReason(ad:AuditableAd):InvalidSubcategoryReason{
  if(!ad.subcategoryId)return 'subcategory_missing';
  if(ad.subcategoryExists===false)return 'subcategory_not_found';
  if(ad.subcategoryActive===false)return 'legacy_id';
  if(ad.leafSemanticallyValid===false&&ad.subcategoryParentMatches!==false)return 'ad_points_to_wrong_leaf';
  if(ad.subcategoryParentMatches===false||!ad.subcategoryValid){
    if(ad.duplicateCategory)return 'duplicate_category';
    if(ad.categoryRemapTargetId)return 'category_remapped';
    return 'parent_child_mismatch';
  }
  return 'other';
}

export function auditAdQuality(ad:AuditableAd):AuditIssue[]{
  const issues:AuditIssue[]=[];
  if(!ad.categoryId||!ad.categoryValid)issues.push({code:'invalid_category',classification:'INVALID_BUT_PRESERVE',impact:'BLOCKING_PUBLIC',message:'القسم مفقود أو غير صالح'});
  if(!ad.subcategoryId||!ad.subcategoryValid){const reason=invalidSubcategoryReason(ad);issues.push({code:'invalid_subcategory',classification:'INVALID_BUT_PRESERVE',impact:'BLOCKING_PUBLIC',reason,message:'القسم الفرعي مفقود أو لا يتبع القسم'});}
  if(!ad.regionId||!ad.cityId||!ad.locationValid)issues.push({code:'missing_or_mismatched_location',classification:'NEEDS_REVIEW',impact:ad.locationExcludedFromGeo?'SAFE_LEGACY':'BLOCKING_PUBLIC',message:'المنطقة أو المدينة مفقودة أو غير مترابطة'});
  if(ad.price<0||ad.oldPrice<0||ad.oldPrice>0&&ad.oldPrice<=ad.price)issues.push({code:'invalid_price',classification:'INVALID_BUT_PRESERVE',impact:'BLOCKING_PUBLIC',message:'السعر الحالي أو السابق غير صالح'});
  if(ad.price>0&&ad.oldPrice>ad.price&&Math.round((ad.oldPrice-ad.price)*100/ad.oldPrice)>=80)issues.push({code:'suspicious_discount',classification:'NEEDS_REVIEW',impact:'EDITORIAL_ONLY',message:'نسبة الخصم مرتفعة جدًا وتحتاج مراجعة'});
  const temporal=Boolean(ad.rentPeriod)||ad.priceType==='rent';
  if((ad.listingType==='sale'&&temporal)||(ad.listingType==='rent'&&!temporal))issues.push({code:'listing_price_mismatch',classification:'NEEDS_REVIEW',impact:'BLOCKING_PUBLIC',message:'نوع الإعلان لا يطابق طريقة أو وحدة السعر'});
  const known=new Set(ad.fields.map(field=>field.key));
  for(const key of Object.keys(ad.values))if(!known.has(key))issues.push({code:'field_not_in_category',classification:'INVALID_BUT_PRESERVE',impact:ad.publicFieldsSuppressed?'SAFE_LEGACY':'BLOCKING_PUBLIC',fieldKey:key,message:'قيمة قديمة لا تنتمي إلى تعريف القسم الحالي'});
  for(const field of ad.fields){
    if(!Object.hasOwn(ad.values,field.key))continue;
    try{validateCategoryValues([{...field,required:false}],{[field.key]:ad.values[field.key]});}
    catch(error){if(error instanceof CategoryValidationError)issues.push({code:'impossible_field_range',classification:'INVALID_BUT_PRESERVE',impact:ad.publicFieldsSuppressed?'SAFE_LEGACY':'BLOCKING_PUBLIC',fieldKey:field.key,message:error.message});else throw error;}
  }
  return issues;
}

export function summarizeAdQualityAudit(rows:AuditableAd[]){
  const summary={records:rows.length,clean:0,AUTO_FIX_SAFE:0,NEEDS_REVIEW:0,INVALID_BUT_PRESERVE:0,
    impacts:{BLOCKING_PUBLIC:0,SAFE_LEGACY:0,EDITORIAL_ONLY:0,NEEDS_EDITOR_REVIEW:0} as Record<AuditImpact,number>,
    subcategoryReasons:{} as Partial<Record<InvalidSubcategoryReason,number>>};
  const impactRank:Record<AuditImpact,number>={EDITORIAL_ONLY:1,SAFE_LEGACY:2,NEEDS_EDITOR_REVIEW:3,BLOCKING_PUBLIC:4};
  for(const row of rows){
    const issues=auditAdQuality(row);
    if(!issues.length){summary.clean++;continue;}
    const classifications=new Set(issues.map(issue=>issue.classification));
    for(const key of ['AUTO_FIX_SAFE','NEEDS_REVIEW','INVALID_BUT_PRESERVE'] as const)if(classifications.has(key))summary[key]++;
    const impact=issues.map(issue=>issue.impact).sort((a,b)=>impactRank[b]-impactRank[a])[0];
    summary.impacts[impact]++;
    for(const issue of issues)if(issue.code==='invalid_subcategory'&&issue.reason)summary.subcategoryReasons[issue.reason]=(summary.subcategoryReasons[issue.reason]||0)+1;
  }
  return summary;
}
