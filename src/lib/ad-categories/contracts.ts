import {CategoryValidationError, validateCategoryValues, visibleCategoryValues, type CategoryField, type CategoryValues} from './validation';
export const CATEGORY_KINDS = ['goods','property','jobs','service','livestock','plants','other'] as const;
export type CategoryKind = typeof CATEGORY_KINDS[number];
export type CategoryOption = {id:number;name:string;active:boolean;order:number};
export type SubcategoryOption = CategoryOption & {categoryId:number;version:number;kind:CategoryKind;priceEnabled:boolean;goodsEnabled:boolean;fields:CategoryField[]};
export type CategoryFormConfig = {enabled:boolean;categories:CategoryOption[];subcategories:SubcategoryOption[];labels:Record<string,string>};
export const CATEGORY_LABELS = {section:'تصنيف الإعلان',category:'القسم',subcategory:'القسم الفرعي',choose:'اختر',error:'راجع القسم والحقول؛ ربما تغيّر تعريفها. أعد تحميل الصفحة ثم حاول مجدداً.',details:'مواصفات الإعلان',preserve:'إبقاء التصنيف الحالي دون تغيير',reclassify:'اختيار تصنيف جديد',preserveHint:'التصنيف الحالي غير متاح للاختيار. يمكنك تصحيح الإعلان مع إبقاء تصنيفه وقيمه وأسعاره الحالية، أو اختيار تصنيف جديد.',browse:'عرض الإعلانات',clear:'مسح التصفية',resultsTitle:'{category} — عرض حتى {limit} إعلانًا',emptyText:'لا توجد إعلانات متاحة في هذا القسم حاليًا.'};
export const categoryEnabled = (v:unknown) => v === '1';
export function categoryPolicy(c:{kind:string;priceEnabled:boolean;goodsEnabled:boolean}) {
  return {priceEnabled:c.kind !== 'jobs' && c.priceEnabled,goodsEnabled:c.kind !== 'jobs' && c.goodsEnabled};
}
export function categoryId(value:unknown):number {
  const s=String(value??'');
  if(!/^[1-9]\d*$/.test(s)||!Number.isSafeInteger(Number(s))||Number(s)>2147483647) throw new CategoryValidationError('','معرف القسم غير صالح');
  return Number(s);
}
export function parseCategorySubmission(fd:FormData, sub:Pick<SubcategoryOption,'id'|'categoryId'|'version'|'fields'>):CategoryValues {
  if(categoryId(fd.get('category_id'))!==sub.categoryId||categoryId(fd.get('subcategory_id'))!==sub.id) throw new CategoryValidationError('','القسم الفرعي غير تابع للقسم');
  if(categoryId(fd.get('category_version'))!==sub.version) throw new CategoryValidationError('','تغيّر تعريف القسم؛ أعد تحميل الصفحة');
  const raw=String(fd.get('category_values')??'{}');
  if(raw.length>100000) throw new CategoryValidationError('','البيانات كبيرة جداً');
  let values:unknown;try{values=JSON.parse(raw);}catch{throw new CategoryValidationError('','بيانات الحقول غير صالحة');}
  return validateCategoryValues(sub.fields,values);
}
export const projectCategory=visibleCategoryValues;
