/** Public labels only. Adding a registered label also adds its admin editor. */
export const INTERFACE_TEXTS = {
  bidding: ['pricing','على السوم'],
  negotiable: ['pricing','السعر قابل للتفاوض'],
  noPrice: ['pricing','السعر غير محدد'],
  noBudget: ['pricing','الميزانية غير محددة'],
  adData: ['create','بيانات العرض'],
  requestData: ['create','بيانات الطلب'],
  title: ['create','عنوان الإعلان'],
  requestTitle: ['create','ماذا تطلب؟'],
  extras: ['create','تفاصيل إضافية'],
  location: ['create','الموقع'],
  images: ['create','الصور'],
  video: ['create','فيديو'],
  audio: ['create','تسجيل صوتي'],
  contact: ['create','وسيلة التواصل'],
  pledge: ['create','التعهّد'],
  listingType: ['create','نوع الإعلان'],
  pricingMethod: ['create','طريقة التسعير'],
  biddingHint: ['create','لا يظهر سعر ثابت، ويستقبل المعلن العروض مباشرة.'],
  comments: ['details','التعليقات'],
  related: ['details','إعلانات ذات صلة — لنفس المعلن'],
  similar: ['details','إعلانات مشابهة'],
} as const;
export type InterfaceTextKey = keyof typeof INTERFACE_TEXTS;
export type InterfaceTexts = Record<InterfaceTextKey,string>;
export const INTERFACE_TEXT_GROUPS = {pricing:'التسعير — الرئيسية والبحث وتفاصيل الإعلان',create:'إضافة وتعديل الإعلان',details:'تفاصيل الإعلان'} as const;
export const defaultInterfaceTexts = Object.fromEntries(Object.entries(INTERFACE_TEXTS).map(([k,v])=>[k,v[1]])) as InterfaceTexts;
export const INTERFACE_TEXT_SETTING = 'interface_texts_v1';
export function parseInterfaceTexts(raw:string):InterfaceTexts {
  let values:Record<string,unknown>={};
  try { const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))values=parsed; } catch {}
  return Object.fromEntries(Object.entries(defaultInterfaceTexts).map(([key,fallback])=>[key,typeof values[key]==='string'&&values[key].trim() ? values[key].trim().slice(0,500):fallback])) as InterfaceTexts;
}
export function interfaceTextChanges(form:FormData,current:InterfaceTexts):InterfaceTexts {
  const next={...current};
  for(const key of Object.keys(INTERFACE_TEXTS) as InterfaceTextKey[]){
    const value=form.get(`ui_${key}`);
    if(value===null)continue;
    if(typeof value!=='string'||value.trim().length>500)throw new Error('نص غير صالح أو يتجاوز 500 حرف');
    next[key]=value.trim()||defaultInterfaceTexts[key];
  }
  return next;
}
