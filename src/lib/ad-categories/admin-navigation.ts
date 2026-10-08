// تنظيم صفحة «الأقسام وحقولها» إلى مهام منفصلة واضحة (مستوحى من تنظيم Codex)،
// لكن كلها تحت مسار /admin/categories عبر ?view= — دون مسارات/صلاحيات جديدة.
export const CATEGORY_ADMIN_PAGES = {
  manage: { title: 'إضافة وتعديل الأقسام', desc: 'إضافة وتعديل وإظهار وإخفاء الأقسام الرئيسية والفرعية.' },
  fields: { title: 'إضافة وتعديل الحقول', desc: 'اختر القسم الفرعي ثم أضف الحقول أو عدّل أسماءها وأنواعها وخياراتها.' },
  requirements: { title: 'الحقول الإجبارية والاختيارية', desc: 'اختر القسم الفرعي ثم حدّد الحقول الإجبارية والاختيارية.' },
  display: { title: 'إظهار وإخفاء الحقول', desc: 'اختر القسم الفرعي ثم تحكّم بظهور كل حقل في نموذج الإعلان.' },
  ads: { title: 'إعلانات الأقسام', desc: 'استعراض الإعلانات حسب القسم والقسم الفرعي.' },
  settings: { title: 'إعدادات الأقسام والنصوص', desc: 'التفعيل العام والنصوص التي تظهر للأعضاء.' },
} as const;
export type CategoryAdminView = keyof typeof CATEGORY_ADMIN_PAGES;
export function isCategoryAdminView(v: string | undefined): v is CategoryAdminView {
  return !!v && Object.hasOwn(CATEGORY_ADMIN_PAGES, v);
}

// أقسام محرّر القسم الفرعي (تبويبات التعديل المركّزة).
export const CATEGORY_EDITOR_SECTIONS = {
  fields: 'إضافة وتعديل الحقول',
  requirements: 'إجباري / اختياري',
  display: 'إظهار / إخفاء',
} as const;
export type CategoryEditorSection = keyof typeof CATEGORY_EDITOR_SECTIONS;
export function isCategoryEditorSection(v: string | undefined): v is CategoryEditorSection {
  return !!v && Object.hasOwn(CATEGORY_EDITOR_SECTIONS, v);
}

/** رابط محرّر قسم فرعي ضمن المسار الواحد (?sub=&section=). */
export function categoryEditorPath(id: number, section: CategoryEditorSection) {
  return `/admin/categories?sub=${id}&section=${section}`;
}

const safeId = (v: string | undefined) =>
  v === undefined || v === '' || (/^[1-9]\d*$/.test(v) && Number(v) <= 2147483647);
export type CategoryAdminQuery = { view?: string; sub?: string; section?: string; category?: string; subcategory?: string; page?: string; review?: string; saved?: string; error?: string };
export function categoryAdminQuery(q: CategoryAdminQuery) {
  return {
    page: Math.min(100000, Math.max(1, Math.floor(Number(q.page)) || 1)),
    category: safeId(q.category) && q.category ? Number(q.category) : null,
    subcategory: safeId(q.subcategory) && q.subcategory ? Number(q.subcategory) : null,
    invalid: !safeId(q.category) || !safeId(q.subcategory) || !safeId(q.sub),
  };
}
