import {CATEGORY_ADMIN_PAGES} from './ad-categories/admin-navigation';

export const CATEGORY_HELP_SETTING='admin_category_help_v1';
const captions={
 manage:'افتح اسم القسم لتعديل اسمه وترتيبه أو إظهاره وإخفائه. القسم الجديد يبدأ مخفيًا. الإخفاء لا يحذف الإعلانات السابقة.',
 ads:'اختر القسم الرئيسي والفرعي ثم «عرض النتائج». افتح الإعلان للمراجعة؛ هذه الصفحة لا تعيد تصنيف البيانات.',
 fields:'اختر الرئيسي ثم الفرعي وافتح حقوله. أضف اسم الحقل ونوعه وخياراته واحفظ قبل الانتقال. لا تغيّر نوع حقل مستخدم؛ أضف حقلًا جديدًا عند الحاجة.',
 requirements:'حدد لكل حقل «إجباري — يجب تعبئته» أو «اختياري — يمكن تركه فارغًا». الإلزام يطبّق عند ظهور الحقل فقط. اقرأ الشرط المحفوظ قبل تغييره. الموقع الدقيق GPS يبقى اختياريًا.',
 display:'حدد أين تستخدم قيمة الحقل: نموذج الإعلان، البحث، الفلاتر، المقارنة، البطاقة أو التفاصيل. هذه الإعدادات مستقلة عن الإجباري والاختياري. الحقول الاختيارية الفارغة لا تظهر في التفاصيل.',
 settings:'من إعدادات الأقسام تحكم بالتفعيل العام والنصوص والقوالب. احفظ وانتظر تأكيد النجاح. عند رفض الحفظ اقرأ اسم الحقل والسبب؛ تعديلاتك تبقى لتصحيحها. إذا سبقك مسؤول بتعديل التعريف احتفظ بتعديلاتك وأعد تحميل الأحدث.',
};
export const HELP_STEPS=Object.entries(CATEGORY_ADMIN_PAGES).map(([key,page])=>({key,title:page.title,href:`/admin/categories/${key}`,caption:captions[key as keyof typeof captions]}));
export type HelpSettings={enabled:boolean;captions:string[]};
export function parseHelpSettings(raw:string,strict=false):HelpSettings{
 try{
  const value=JSON.parse(raw);
  if(typeof value.enabled!=='boolean'||!Array.isArray(value.captions)||value.captions.length!==HELP_STEPS.length||value.captions.some((s:unknown)=>typeof s!=='string'||!s.trim()||s.length>1200))throw new Error('invalid help content');
  return {enabled:value.enabled,captions:value.captions.map((s:string)=>s.trim())};
 }catch{
  if(strict)throw new Error('أدخل شرحًا لكل خطوة، بحد أقصى 1200 حرف للخطوة.');
  return {enabled:true,captions:HELP_STEPS.map(s=>s.caption)};
 }
}
