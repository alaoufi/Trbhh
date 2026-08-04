// أنواع العقار واستخداماته — مشترك بين نموذج الإضافة والفلاتر.
// ملف عادي (بلا server-only) ليُستورد في مكوّنات العميل والخادم معاً.
export const RE_TYPES = ['شقة', 'فيلا', 'دور', 'أرض', 'عمارة', 'استوديو', 'دوبلكس', 'شاليه', 'استراحة', 'مكتب', 'محل تجاري', 'مستودع', 'مزرعة'];
export const LAND_USES = ['سكني', 'تجاري', 'سكني تجاري', 'زراعي', 'صناعي'];
export const PROJECT_TYPES = ['سكني', 'تجاري', 'مختلط', 'فلل', 'شقق', 'أراضٍ مطوّرة', 'أبراج'];

// تصنيف نوع العقار لتحديد الحقول/المميزات المناسبة (مشترك بين النموذج والعرض)
export type PropKind = 'land' | 'building' | 'residential' | 'commercial' | '';
export function propKind(t: string | null | undefined): PropKind {
  if (!t) return '';
  if (['أرض', 'مزرعة'].includes(t)) return 'land';
  if (t === 'عمارة') return 'building';
  if (['مكتب', 'محل تجاري', 'مستودع'].includes(t)) return 'commercial';
  return 'residential'; // شقة/فيلا/دور/استوديو/دوبلكس/شاليه/استراحة
}

// مميزات العقار (مثل تطبيقات العقار السعودية): كل ميزة لها مفتاح ثابت (يُخزَّن)،
// وتسمية، وأيقونة، والأنواع التي تظهر لها (kinds). ميزة بلا kinds تظهر لكل الأنواع.
// حالة الإعلان (يتحكم بها المالك) — تُميّز المتاح عن المحجوز/المباع
export const RE_LISTING_STATUS = ['متاح', 'محجوز', 'مؤجر', 'مباع'];

// حالة العقار (مقتبَس من تطبيقات العقار السعودية) — للعقارات المبنية دون الأرض
export const RE_CONDITIONS = ['جديد', 'مستعمل', 'تحت الإنشاء', 'على الخارطة'];
// التشطيب — يُبرز خصوصاً للجديد/تحت الإنشاء
export const RE_FINISHES = ['مشطّب بالكامل', 'نصف تشطيب', 'على العظم'];
/** هل يُعرَض حقلا الحالة/التشطيب لهذا النوع؟ (كل الأنواع عدا الأرض/المزرعة) */
export function hasCondition(kind: PropKind): boolean {
  return kind === 'residential' || kind === 'building' || kind === 'commercial';
}

export type ReFeature = { key: string; label: string; icon: string; kinds: PropKind[] };
export const RE_FEATURES: ReFeature[] = [
  // تمويل — ميزة سعودية بارزة (يُعرض أولاً)
  { key: 'mortgage', label: 'قابل للتمويل', icon: '🏦', kinds: ['residential', 'building', 'commercial', 'land'] },
  // سكني (فلل/شقق/أدوار/استراحات…)
  { key: 'driver', label: 'غرفة سائق', icon: '🚘', kinds: ['residential'] },
  { key: 'maid', label: 'غرفة خادمة', icon: '🧹', kinds: ['residential'] },
  { key: 'annex', label: 'ملحق', icon: '🏠', kinds: ['residential'] },
  { key: 'yard', label: 'حوش', icon: '🏡', kinds: ['residential'] },
  { key: 'garden', label: 'حديقة', icon: '🌳', kinds: ['residential'] },
  { key: 'kitchen', label: 'مطبخ راكب', icon: '🍽️', kinds: ['residential'] },
  { key: 'carEntry', label: 'مدخل سيارة', icon: '🚙', kinds: ['residential'] },
  { key: 'roof', label: 'سطح', icon: '🏗️', kinds: ['residential'] },
  { key: 'basement', label: 'قبو', icon: '🕳️', kinds: ['residential'] },
  // مشترك (سكني/عمارة/تجاري)
  { key: 'elevator', label: 'مصعد', icon: '🛗', kinds: ['residential', 'building', 'commercial'] },
  { key: 'parking', label: 'مواقف سيارات', icon: '🅿️', kinds: ['residential', 'building', 'commercial'] },
  { key: 'ac', label: 'مكيّفات', icon: '❄️', kinds: ['residential', 'building', 'commercial'] },
  { key: 'storage', label: 'مستودع', icon: '📦', kinds: ['residential', 'building', 'commercial'] },
  { key: 'security', label: 'أمن وحراسة', icon: '👮', kinds: ['building', 'commercial'] },
  { key: 'generator', label: 'مولّد كهرباء', icon: '🔌', kinds: ['building', 'commercial'] },
  { key: 'centralAc', label: 'تكييف مركزي', icon: '🌬️', kinds: ['building', 'commercial'] },
  // خدمات قريبة (سكني/تجاري)
  { key: 'nearMosque', label: 'قرب مسجد', icon: '🕌', kinds: ['residential', 'commercial'] },
  { key: 'nearSchool', label: 'قرب مدارس', icon: '🏫', kinds: ['residential'] },
  { key: 'mainStreet', label: 'على شارع رئيسي', icon: '🛣️', kinds: ['commercial', 'building'] },
  // أرض / مزرعة
  { key: 'electricity', label: 'كهرباء', icon: '⚡', kinds: ['land'] },
  { key: 'water', label: 'مياه', icon: '🚰', kinds: ['land'] },
  { key: 'sewage', label: 'صرف صحي', icon: '🚽', kinds: ['land'] },
  { key: 'serviced', label: 'مخدومة/مطوّرة', icon: '✅', kinds: ['land'] },
  { key: 'walled', label: 'مُسوّرة', icon: '🧱', kinds: ['land'] },
  { key: 'well', label: 'بئر ماء', icon: '💧', kinds: ['land'] },
  { key: 'palms', label: 'نخيل/مزروعة', icon: '🌴', kinds: ['land'] },
];
const RE_FEATURE_MAP: Record<string, ReFeature> = Object.fromEntries(RE_FEATURES.map((f) => [f.key, f]));
/** مفاتيح المميزات المناسبة لنوع عقار معيّن. */
export function featuresForKind(kind: PropKind): ReFeature[] {
  if (!kind) return [];
  return RE_FEATURES.filter((f) => f.kinds.includes(kind));
}
/** تحويل نص المميزات المخزَّن (مفاتيح مفصولة بفواصل) إلى تسميات+أيقونات للعرض. */
export function parseFeatures(raw: string | null | undefined): ReFeature[] {
  if (!raw) return [];
  return raw.split(',').map((k) => RE_FEATURE_MAP[k.trim()]).filter(Boolean);
}
