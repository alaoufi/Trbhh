/** Admin-editable controls for the approved site audit. */
export const AUDIT_UX_FLAGS = [
  ['home_discovery_on', 'إظهار البحث والإضافة في مقدمة الرئيسية'],
  ['search_price_filter_on', 'إظهار فلتر السعر في البحث'],
  ['ad_mobile_contact_on', 'شريط التواصل في صفحة الإعلان على الجوال'],
  ['store_landing_on', 'صفحة تعريف المتجر والأسعار قبل الدخول'],
  ['store_onboarding_on', 'إعداد المتجر على خطوات'],
] as const;
export const AUDIT_UX_TEXTS = [
  ['home_discovery_title', 'عنوان مقدمة الرئيسية', 'تربح — إعلانات ومتاجر قريبة منك'],
  ['home_discovery_subtitle', 'وصف مقدمة الرئيسية', 'ابحث عن عرضك القادم أو أضف إعلانك وتواصل مباشرة مع المعلن.'],
  ['home_discovery_search_placeholder', 'تلميح البحث', 'ماذا تبحث عنه؟'],
  ['home_discovery_add_label', 'زر إضافة الإعلان', 'أضف إعلانك'],
  ['store_landing_title', 'عنوان التعريف بالمتجر', 'متجرك باسمك، ومنتجاتك في مكان واحد'],
  ['store_landing_intro', 'وصف التعريف بالمتجر', 'اعرض منتجاتك في صفحة مستقلة، واختر تصميمك وتواصل مباشرة مع عملائك.'],
  ['store_landing_features', 'مزايا المتجر (ميزة في كل سطر)', 'رابط مستقل باسم متجرك\nتصاميم وألوان قابلة للتخصيص\nكتالوج للمنتجات ووسائل تواصل مباشرة\nإحصاءات لإدارة نشاط المتجر'],
  ['store_landing_cta', 'زر بدء إعداد المتجر', 'ابدأ إعداد متجرك'],
  ['store_step_basics', 'خطوة بيانات المتجر', 'البيانات الأساسية'],
  ['store_step_contact', 'خطوة التواصل', 'التواصل'],
  ['store_step_design', 'خطوة التصميم', 'التصميم'],
  ['store_step_preview', 'خطوة المعاينة', 'المعاينة'],
] as const;
