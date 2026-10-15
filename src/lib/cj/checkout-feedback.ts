const messages:Record<string,string>={
 recheck:'تعذر إنشاء الطلب بعد إعادة التحقق. لم يبدأ الدفع. أعد المحاولة، وإذا تكرر الخطأ تواصل مع الإدارة.',
 fiscal:'لم تُعتمد جهة إصدار الفاتورة بعد. سجّل اسم الجهة وعنوانها الحقيقيين، واختر «معطلة — دون تحصيل ضريبة» إذا لم تكن مسجلاً، ثم أرسل الإعدادات واعتمد الطلب. الرقم الضريبي لا يلزم عند التعطيل.',
 pricing:'هامش السعر أو سعر الصرف غير معتمد للشراء. يجب على الإدارة مراجعة إعدادات التسعير.',
 warehouse:'تعذر تحديد مستودع واحد يوفّر الكمية ومسار الشحن المختار. لم يبدأ الدفع.',
 changed:'تغير السعر أو الشحن أو الضريبة. راجع المنتج وأعد إضافته بالسعر الجديد قبل الدفع.',
 provider:'تعذر التحقق من بيانات المورد الآن. لم يبدأ الدفع؛ حاول لاحقًا.',
 address:'راجع عنوان الشحن قبل الدفع: الجوال السعودي والشارع ورقم المبنى والعنوان الوطني المختصر (4 أحرف و4 أرقام) مطلوبة.',
 invalid:'بيانات السلة غير صالحة. أعد إضافة المنتج قبل الدفع.',
};
export function cjCheckoutFeedback(value:unknown):string|null{return typeof value==='string'&&Object.hasOwn(messages,value)?messages[value]:null;}
export function cjCheckoutFailure(cause:unknown):string{
 const code=cause instanceof Error?cause.message:'';
 if(code==='finance_issuance_not_approved')return 'fiscal';
 if(['cj_pricing_unverified','cj_live_margin_unapproved'].includes(code))return 'pricing';
 if(code==='cj_live_warehouse_ambiguous')return 'warehouse';
 if(['cj_live_quote_changed','cj_live_supplier_price_changed','cj_live_freight_changed','cj_live_tax_changed','cj_live_provider_changed'].includes(code))return 'changed';
 if(['cj_live_provider_unavailable','cj_live_variant_unavailable'].includes(code))return 'provider';
 return 'recheck';
}
