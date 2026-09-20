export const ONBOARDING_FIELDS = [
 ['establishment_name','اسم المنشأة',true],['store_name','اسم المتجر',true],['store_url','رابط متجر سلة',true],['entity_type','نوع الكيان',false],
 ['registration_number','السجل التجاري',true],['registration_expiry','تاريخ انتهاء السجل',false],['tax_number','الرقم الضريبي',false],
 ['address','العنوان',false],['region','المنطقة',false],['city','المدينة',false],['contact_name','اسم صاحب المتجر أو المفوض',true],['contact_role','الصفة',false],
 ['identity_number','رقم الهوية/الإقامة',false],['phone','الجوال',true],['email','البريد',true],['preparation_time','مدة تجهيز الطلب',false],['delivery_time','مدة التوصيل',false],
 ['shipping_companies','شركات الشحن',false],['coverage','تغطية مناطق السعودية',false],['excluded_regions','المناطق المستثناة',false],
 ['stock_actual','تأكيد أن مخزون سلة فعلي',false],['stock_updated','تأكيد تحديث المخزون',false],['returns_policy','سياسة الاستبدال والاسترجاع',false],
 ['returns_period','مدة الاسترجاع',false],['damage_policy','معالجة التالف أو غير المطابق',false],['return_shipping','من يتحمل شحن المرتجع',false],
 ['settlement_terms','دورية التسوية',false],['beneficiary_name','اسم المستفيد البنكي',false],['bank_name','اسم البنك',false],['iban','IBAN',false],
 ['account_holder','اسم صاحب الحساب',false],['authorized_name','اسم المفوض بالموافقة',false],['agreements','الإقرارات والموافقات',false],['submitted_date','تاريخ تعبئة النموذج',false],['notes','الملاحظات',false],
] as const;
export type OnboardingValues=Record<string,string|null>;
export type OnboardingValidation={values:OnboardingValues;errors:string[];warnings:string[]};
export const ONBOARDING_LABELS:Record<string,string>=Object.fromEntries(ONBOARDING_FIELDS.map(([k,label])=>[k,label]));
export function maskedOnboardingValue(key:string,value:string|null|undefined):string {
 if(!value)return '—';
 return ['identity_number','iban'].includes(key)?`•••• ${value.slice(-4)}`:value;
}
