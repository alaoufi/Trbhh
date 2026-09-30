import {CategoryValidationError, validateCategoryValues, type CategoryField, type CategoryValues} from '@/lib/ad-categories/validation';

export type AuditClassification='AUTO_FIX_SAFE'|'NEEDS_REVIEW'|'INVALID_BUT_PRESERVE';
export type AuditIssue={code:string;classification:AuditClassification;fieldKey?:string;message:string};
export type AuditableAd={
  id:number;categoryId:number|null;subcategoryId:number|null;categoryValid:boolean;subcategoryValid:boolean;
  regionId:number|null;cityId:number|null;locationValid:boolean;title:string;price:number;oldPrice:number;
  listingType:string|null;priceType:string|null;rentPeriod:string|null;fields:CategoryField[];values:CategoryValues;
};

export function auditAdQuality(ad:AuditableAd):AuditIssue[]{
  const issues:AuditIssue[]=[];
  if(!ad.categoryId||!ad.categoryValid)issues.push({code:'invalid_category',classification:'INVALID_BUT_PRESERVE',message:'القسم مفقود أو غير صالح'});
  if(!ad.subcategoryId||!ad.subcategoryValid)issues.push({code:'invalid_subcategory',classification:'INVALID_BUT_PRESERVE',message:'القسم الفرعي مفقود أو لا يتبع القسم'});
  if(!ad.regionId||!ad.cityId||!ad.locationValid)issues.push({code:'missing_or_mismatched_location',classification:'NEEDS_REVIEW',message:'المنطقة أو المدينة مفقودة أو غير مترابطة'});
  if(ad.price<0||ad.oldPrice<0||ad.oldPrice>0&&ad.oldPrice<=ad.price)issues.push({code:'invalid_price',classification:'INVALID_BUT_PRESERVE',message:'السعر الحالي أو السابق غير صالح'});
  if(ad.price>0&&ad.oldPrice>ad.price&&Math.round((ad.oldPrice-ad.price)*100/ad.oldPrice)>=80)issues.push({code:'suspicious_discount',classification:'NEEDS_REVIEW',message:'نسبة الخصم مرتفعة جدًا وتحتاج مراجعة'});
  const temporal=Boolean(ad.rentPeriod)||ad.priceType==='rent';
  if((ad.listingType==='sale'&&temporal)||(ad.listingType==='rent'&&!temporal))issues.push({code:'listing_price_mismatch',classification:'NEEDS_REVIEW',message:'نوع الإعلان لا يطابق طريقة أو وحدة السعر'});
  const known=new Set(ad.fields.map(field=>field.key));
  for(const key of Object.keys(ad.values))if(!known.has(key))issues.push({code:'field_not_in_category',classification:'INVALID_BUT_PRESERVE',fieldKey:key,message:'قيمة قديمة لا تنتمي إلى تعريف القسم الحالي'});
  for(const field of ad.fields){
    if(!Object.hasOwn(ad.values,field.key))continue;
    try{validateCategoryValues([{...field,required:false}],{[field.key]:ad.values[field.key]});}
    catch(error){if(error instanceof CategoryValidationError)issues.push({code:'impossible_field_range',classification:'INVALID_BUT_PRESERVE',fieldKey:field.key,message:error.message});else throw error;}
  }
  return issues;
}

export function summarizeAdQualityAudit(rows:AuditableAd[]){
  const summary={records:rows.length,clean:0,AUTO_FIX_SAFE:0,NEEDS_REVIEW:0,INVALID_BUT_PRESERVE:0};
  for(const row of rows){
    const issues=auditAdQuality(row);
    if(!issues.length){summary.clean++;continue;}
    const classifications=new Set(issues.map(issue=>issue.classification));
    for(const key of ['AUTO_FIX_SAFE','NEEDS_REVIEW','INVALID_BUT_PRESERVE'] as const)if(classifications.has(key))summary[key]++;
  }
  return summary;
}
