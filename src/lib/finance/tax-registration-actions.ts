/** Existing read/review destinations only; never an approval or money action. */
export function taxGapReview(code:string):{href:string;label:string;instructions:string}{
 if(code==='threshold_unverified')return {href:'/admin/finance?section=tax#tax-policy-settings',label:'مراجعة إعدادات الفواتير والاعتماد',instructions:'راجع حالة الإعداد المحفوظ وبدء سريانه. الحفظ من الحساب المخوّل يطبّق الإعدادات المكتملة؛ لا يلزم تكرار اعتماد إعداد محفوظ صحيح.'};
 const services=['featured','urgent','bump','classified','duplicate','subscription','store_plus','store_show','ad_show','verify_fee','lead','auction'];
 const reason=code.startsWith('wallet_')?code.slice(7):'';
 if(services.includes(reason))return {href:'/admin/revenue?tab=payments&cat='+reason,label:'فتح حركات هذه الخدمة',instructions:'طابق رقم كل عملية وتاريخها ومبلغها مع المستند والاسترداد المرتبط إن وجد. عرض الحركات لا يصنّفها ضريبيًا ولا يغلق التنبيه تلقائيًا؛ يلزم توثيق المعالجة المالية.'};
 if(['admin_debit','refund','member_service','unclassified'].includes(reason))return {href:'/admin/revenue?tab=balances',label:'فتح أرصدة الأعضاء وسجل الحركات',instructions:'افتح العضو والعملية وطابق المستند وسبب الخصم أو الاسترداد. لا تغيّر الرصيد لمجرد إغلاق التنبيه؛ يلزم توثيق المعالجة المالية.'};
 if(['invoice_unverified','paid_unissued'].includes(code))return {href:'/admin/finance?section=invoices#admin-content',label:'مراجعة الفواتير ومصدر الطلب',instructions:'راجع الطلب والمقبوض وسياسة الإصدار والمستند المرتبط. الفاتورة المعلقة لا تُصدر بمجرد فتح هذا التنبيه.'};
 if(['adjustment_unverified','adjustment_parent_missing','refund_unmatched'].includes(code))return {href:'/admin/finance?section=returns#admin-content',label:'مراجعة المرتجعات والمستند الأصلي',instructions:'طابق المستند الأصلي والإشعار والمبلغ المرتجع مع دليل رد المال. فتح الصفحة أو اعتماد إشعار لا ينفذ استردادًا ماليًا.'};
 return {href:'/admin/finance?section=reconciliation#admin-content',label:'فتح مصادر المطابقة',instructions:'راجع مصدر البيانات والفروقات أولًا. إذا كانت المصادر غير جاهزة يلزم تصحيحها؛ لا تعتمد صفرًا أو تغلق التنبيه بلا دليل.'};
}
