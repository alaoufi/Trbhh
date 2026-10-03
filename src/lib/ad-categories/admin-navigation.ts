export const CATEGORY_ADMIN_PAGES={
  manage:{title:'إضافة وتعديل الأقسام',description:'إضافة وتعديل وإظهار وإخفاء الأقسام الرئيسية والفرعية.'},
  ads:{title:'إعلانات الأقسام',description:'استعراض الإعلانات حسب القسم والقسم الفرعي، وفتح تفاصيلها.'},
  fields:{title:'إضافة وتعديل الحقول',description:'اختر القسم ثم أضف الحقول أو عدّل أسماءها وأنواعها وخياراتها.'},
  requirements:{title:'الحقول الإجبارية والاختيارية',description:'اختر القسم ثم حدد الحقول التي يجب تعبئتها والتي يمكن تركها فارغة.'},
  display:{title:'أين تظهر الحقول؟',description:'اختر القسم ثم حدد ظهور الحقل في النموذج والبحث والبطاقات والتفاصيل.'},
  settings:{title:'إعدادات الأقسام',description:'التفعيل العام والنصوص التي تظهر للأعضاء.'},
} as const;
export type CategoryAdminView=keyof typeof CATEGORY_ADMIN_PAGES|'create';
export function isCategoryAdminView(value:string):value is CategoryAdminView{return value==='create'||Object.hasOwn(CATEGORY_ADMIN_PAGES,value);}
export type CategoryAdminQuery={error?:string;saved?:string;page?:string;category?:string;subcategory?:string;review?:string};
export function categoryAdminQuery(q:CategoryAdminQuery){
  const validId=(value:string|undefined)=>value===undefined||value===''||(/^[1-9]\d*$/.test(value)&&Number(value)<=2147483647);
  return {page:Math.min(100000,Math.max(1,Math.floor(Number(q.page))||1)),category:validId(q.category)&&q.category?Number(q.category):null,subcategory:validId(q.subcategory)&&q.subcategory?Number(q.subcategory):null,invalid:!validId(q.category)||!validId(q.subcategory)};
}
