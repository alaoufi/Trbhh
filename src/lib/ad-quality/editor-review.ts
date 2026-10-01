import {publicCategoryFieldTrust} from '@/lib/ad-categories/public-trust';
import type {CategoryValues} from '@/lib/ad-categories/validation';

export type EditorReviewSource={
  id:number;title:string;categoryName:string|null;categoryActive:boolean;
  subcategoryName:string|null;subcategoryActive:boolean;subcategoryParentMatches:boolean;
  templateKey?:string;values:CategoryValues;knownFieldKeys:string[];
  cityName:string|null;areaName:string|null;locationMatches:boolean;
};

export type EditorReviewRow={
  adId:number;title:string;currentCategory:string;currentSubcategory:string;currentLeaf:string;
  reasons:string[];suggestedCategory:null;legacyFieldKeys:string[];
  locationStatus:'valid'|'excluded_from_nearby';disposition:'NEEDS_EDITOR_REVIEW';
};

/**
 * Read-only editorial projection. It deliberately never guesses a replacement
 * category: a suggestion is only safe when a separately reviewed deterministic
 * mapping exists, and none is implied by legacy titles or values.
 */
export function buildEditorReviewRow(source:EditorReviewSource):EditorReviewRow|null{
  const reasons:string[]=[];
  if(!source.categoryName||!source.categoryActive)reasons.push('القسم الحالي مفقود أو غير نشط');
  if(!source.subcategoryName||!source.subcategoryActive)reasons.push('القسم الفرعي مفقود أو غير نشط');
  if(source.subcategoryName&&!source.subcategoryParentMatches)reasons.push('القسم الفرعي لا يتبع القسم الحالي');
  const trust=publicCategoryFieldTrust({templateKey:source.templateKey,title:source.title,values:source.values});
  if(!trust.trusted)reasons.push(trust.reason==='lifting_kind_conflict'?'نوع المعدة لا يطابق عنوان الإعلان':'التصنيف الحالي لا يطابق محتوى الإعلان');
  const known=new Set(source.knownFieldKeys);
  const legacyFieldKeys=Object.keys(source.values).filter(key=>!known.has(key)).sort();
  if(legacyFieldKeys.length)reasons.push('توجد حقول قديمة محفوظة ومحجوبة عن العرض العام');
  const locationStatus=source.cityName&&source.areaName&&source.locationMatches?'valid':'excluded_from_nearby';
  if(locationStatus==='excluded_from_nearby')reasons.push('الموقع غير مكتمل أو غير مترابط ومستبعد من القريب');
  if(!reasons.length)return null;
  return {
    adId:source.id,title:source.title,currentCategory:source.categoryName||'غير محدد',
    currentSubcategory:source.subcategoryName||'غير محدد',currentLeaf:source.subcategoryName||'غير محدد',
    reasons,suggestedCategory:null,legacyFieldKeys,locationStatus,disposition:'NEEDS_EDITOR_REVIEW',
  };
}
