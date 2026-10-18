import {canAccessPage} from '@/lib/access-control/catalog';
/** Existing read/review destinations only; never an approval or money action. */
export function taxGapReview(code:string):{href:string;label:string;instructions:string}{
 if(code==='threshold_unverified')return {href:'/admin/finance?section=tax#tax-policy-settings',label:'مراجعة إعدادات الفواتير والاعتماد',instructions:'راجع حالة الإعداد المحفوظ وبدء سريانه. الحفظ من الحساب المخوّل يطبّق الإعدادات المكتملة؛ لا يلزم تكرار اعتماد إعداد محفوظ صحيح.'};
 const services=['featured','urgent','bump','classified','duplicate','subscription','store_plus','store_show','ad_show','verify_fee','lead','auction'];
 const reason=code.startsWith('wallet_')?code.slice(7):'';
 if([...services,'admin_debit','refund','member_service','unclassified'].includes(reason))return {href:'/admin/finance?section=tax#wallet-review',label:'مراجعة الحركات وتوثيق القرار',instructions:'راجع رقم الحركة ومصدرها والمستند في كشف المراجعة. طلب المستند يبقى مفتوحًا؛ الاعتماد الصريح من المخوّل يربط الدليل والتصنيف بالصافي، ولا يغيّر الرصيد أو ينفّذ استردادًا.'};
 if(['invoice_unverified','paid_unissued'].includes(code))return {href:'/admin/finance?section=invoices#admin-content',label:'مراجعة الفواتير ومصدر الطلب',instructions:'راجع الطلب والمقبوض وسياسة الإصدار والمستند المرتبط. الفاتورة المعلقة لا تُصدر بمجرد فتح هذا التنبيه.'};
 if(['adjustment_unverified','adjustment_parent_missing','refund_unmatched'].includes(code))return {href:'/admin/finance?section=returns#admin-content',label:'مراجعة المرتجعات والمستند الأصلي',instructions:'طابق المستند الأصلي والإشعار والمبلغ المرتجع مع دليل رد المال. فتح الصفحة أو اعتماد إشعار لا ينفذ استردادًا ماليًا.'};
 return {href:'/admin/finance?section=reconciliation#admin-content',label:'فتح مصادر المطابقة',instructions:'راجع مصدر البيانات والفروقات أولًا. إذا كانت المصادر غير جاهزة يلزم تصحيحها؛ لا تعتمد صفرًا أو تغلق التنبيه بلا دليل.'};
}

export function allowedTaxGapReviewHrefs(codes:string[],keys:ReadonlySet<string>):string[]{return [...new Set(codes.map(code=>taxGapReview(code).href))].filter(href=>canAccessPage(keys,href)&&(!href.endsWith('#wallet-review')||keys.has('wallets:view')));}
