export const CATEGORY_ADMIN_PAGES={
  ads:{title:'إعلانات الأقسام',description:'استعراض الإعلانات حسب القسم والقسم الفرعي، وفتح تفاصيلها.'},
  manage:{title:'التحكم بالأقسام وإدارتها',description:'إضافة وتعديل وإظهار وإخفاء الأقسام الرئيسية والفرعية.'},
  fields:{title:'إضافة حقول الأقسام وإدارتها',description:'إضافة الحقول وتعديلها، وتحديد الإجباري والاختياري وأماكن ظهورها.'},
  settings:{title:'إعدادات الأقسام والنصوص',description:'التفعيل العام والنصوص التي تظهر للأعضاء.'},
} as const;
export type CategoryAdminView=keyof typeof CATEGORY_ADMIN_PAGES|'create';
export function isCategoryAdminView(value:string):value is CategoryAdminView{return value==='create'||Object.hasOwn(CATEGORY_ADMIN_PAGES,value);}
export type CategoryAdminQuery={error?:string;saved?:string;page?:string;category?:string;subcategory?:string;review?:string};
export function categoryAdminQuery(q:CategoryAdminQuery){
  const validId=(value:string|undefined)=>value===undefined||value===''||(/^[1-9]\d*$/.test(value)&&Number(value)<=2147483647);
  return {page:Math.min(100000,Math.max(1,Math.floor(Number(q.page))||1)),category:validId(q.category)&&q.category?Number(q.category):null,subcategory:validId(q.subcategory)&&q.subcategory?Number(q.subcategory):null,invalid:!validId(q.category)||!validId(q.subcategory)};
}
