/**
 * The public, actionable explanation for every rejection emitted by the
 * Trbhh public-ad flow. Keep this separate from moderation logs: members see
 * only the reason and the safe next step, never internal heuristics.
 */
export type AdPublishRejectionCode =
  | 'missing' | 'contact' | 'pledge' | 'blocked' | 'toomany' | 'image'
  | 'flood' | 'repeat' | 'free-duplicate' | 'crossdup' | 'needdup'
  | 'needcredit' | 'banned' | 'editWindow' | 'limit' | 'gap' | 'store';

export type AdPublishRejection = {
  title: string;
  reason: string;
  nextStep: string;
  actionHref?: string;
  actionLabel?: string;
};

const REJECTIONS: Record<AdPublishRejectionCode, AdPublishRejection> = {
  store: { title: 'لم يُحفظ الإعلان', reason: 'لم يتحدد متجر متاح للنشر باسمك.', nextStep: 'افتح متجرك الصحيح ثم أعد إضافة الإعلان، أو اختر النشر باسمك الشخصي.', actionHref: '/store', actionLabel: 'فتح متجري' },
  missing: { title: 'لم يُنشر الإعلان', reason: 'العنوان أو التفاصيل المطلوبة غير مكتملة.', nextStep: 'أكمل الحقول المطلوبة ثم أعد النشر.' },
  contact: { title: 'لم يُنشر الإعلان', reason: 'لا توجد وسيلة تواصل ظاهرة للمشتري.', nextStep: 'أضف رقم الجوال أو واتساب ثم أعد النشر.' },
  pledge: { title: 'لم يُنشر الإعلان', reason: 'لم تؤكد تعهّد صحة الإعلان.', nextStep: 'فعّل مربع التعهّد ثم أعد النشر.' },
  blocked: { title: 'رُفض الإعلان', reason: 'المحتوى يخالف سياسة النشر.', nextStep: 'احذف المحتوى المخالف من الإعلان قبل إعادة النشر.' },
  toomany: { title: 'رُفض الإعلان', reason: 'يحتوي الإعلان كلمات مخالفة أكثر من المسموح.', nextStep: 'احذف الكلمات المخالفة واكتب وصفاً واضحاً ثم أعد النشر.' },
  image: { title: 'رُفضت الصور', reason: 'إحدى الصور تحتاج مراجعة لأنها قد لا تكون مناسبة.', nextStep: 'استبدلها بصور واضحة للسلعة أو الخدمة فقط ثم أعد النشر.' },
  flood: { title: 'تم إيقاف النشر مؤقتاً', reason: 'تمت محاولة نشر إعلانات بسرعة متتالية.', nextStep: 'انتظر الوقت الموضح ثم أعد المحاولة.' },
  repeat: { title: 'عدّل وصف الإعلان', reason: 'جزء كبير من النص عبارة عن كلمات أو عبارات مكررة.', nextStep: 'اكتفِ بذكر المعلومة مرة واحدة ثم أعد النشر؛ تكرار اسم الخدمة ضمن مواصفات مختلفة مسموح.' },
  'free-duplicate': { title: 'لديك إعلان مماثل', reason: 'العنوان والوصف مطابقان أو قريبان جداً من إعلانك المنشور.', nextStep: 'يمكنك فتح إعلانك السابق وتعديله بدل إنشاء نسخة أخرى. إعادة النشر تبقى حسب استحقاق باقتك.', actionHref: '/packages', actionLabel: 'خيارات الباقات' },
  crossdup: { title: 'راجع نص الإعلان', reason: 'العنوان والوصف قريبان جداً من إعلان منشور لعضو آخر.', nextStep: 'وضّح مواصفات عرضك واكتب وصفك الخاص ثم أعد النشر. لا يُحظر حسابك بسبب هذا التنبيه.' },
  needdup: { title: 'لم يُنشر الإعلان', reason: 'الإعلان مكرّر ولا تملك باقة تكرار صالحة.', nextStep: 'اختر باقة مناسبة ثم أعد النشر.', actionHref: '/packages', actionLabel: 'عرض الباقات المتاحة' },
  needcredit: { title: 'لم تُنفذ العملية', reason: 'الرصيد المتاح لا يغطي قيمة الخدمة المطلوبة.', nextStep: 'اشحن رصيدك ثم أعد المحاولة.', actionHref: '/account/wallet#topup', actionLabel: 'شحن الرصيد' },
  banned: { title: 'النشر متوقف لحسابك', reason: 'تم إيقاف النشر بسبب مخالفات نشر متكررة.', nextStep: 'لا يمكنك نشر إعلان جديد أثناء مدة الإيقاف.' },
  editWindow: { title: 'تعذر حفظ التعديل', reason: 'انتهت المهلة المسموح بها لتعديل الإعلان.', nextStep: 'لا يمكن تعديل الإعلان بعد انتهاء المهلة المحددة في النظام.' },
  limit: { title: 'لم يُنشر الإعلان', reason: 'استخدمت كامل عدد الإعلانات المتاح لك اليوم.', nextStep: 'انتظر حتى يبدأ اليوم التالي أو اشترك في باقة بعدد إعلانات أكبر.', actionHref: '/packages', actionLabel: 'عرض الباقات المتاحة' },
  gap: { title: 'لم يُنشر الإعلان', reason: 'لم يكتمل الفاصل الزمني المطلوب بين الإعلانات في باقتك.', nextStep: 'انتظر المدة المتبقية أو اشترك في باقة بفاصل أقل.', actionHref: '/packages', actionLabel: 'عرض الباقات المتاحة' },
};

export function adPublishRejection(code: AdPublishRejectionCode): AdPublishRejection {
  return REJECTIONS[code];
}
