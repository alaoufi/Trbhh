import 'server-only';
import { normalizeAr } from '@/domain/text';
import { getSetting, getSettingBool } from './settings';

/**
 * كاشف الإعلان العقاري — محلي بالكلمات المفتاحية (بلا أي خدمة خارجية)، يعمل على
 * نص الإعلان (العنوان + التفاصيل) فقط. الغرض: تمييز الإعلانات العقارية حتى نتمكّن
 * من إيقافها مؤقتاً (ريثما تكتمل وحدة التوثيق العقاري المتوافقة مع أنظمة الهيئة
 * العامة للعقار)، ثم لاحقاً إلزامها بحقول الترخيص.
 *
 * التوجّه: نميل لكشف أوسع (استدعاء أعلى) لا أضيق — تفويت إعلان عقاري = خطر نظامي،
 * أمّا كشف إعلان غير عقاري بالخطأ فمزعج فقط ويُصحَّح يدوياً من الإدارة لاحقاً.
 * لذلك أي كلمة «قوية» واضحة الدلالة تكفي وحدها؛ والكلمات «الضعيفة» المحتمَلة تحتاج
 * تطابقين. الكلمات تُقارَن بعد توحيدها (normalizeAr) كما في src/lib/classifier.ts.
 */

// كلمات قاطعة الدلالة على العقار — وجود أيٍّ منها يكفي لاعتبار الإعلان عقارياً.
const STRONG = [
  'عقار', 'عقارات', 'عقاري', 'شقة', 'شقق', 'فيلا', 'فلة', 'فلل', 'دوبلكس', 'عمارة',
  'عمائر', 'تمليك', 'استراحة', 'شاليه', 'بنتهاوس', 'روف', 'بيت شعبي', 'دور علوي',
  'دور ارضي', 'مزرعة', 'اراضي', 'قطعة ارض', 'ارض سكنية', 'ارض تجارية', 'ارض زراعية',
  'مخطط سكني', 'شقة مفروشة', 'غرفة وصالة',
];

// كلمات محتمَلة (قد ترد في سياق غير عقاري) — تحتاج تطابقين معاً لاعتبار الإعلان عقارياً.
const WEAK = [
  'ايجار', 'للايجار', 'سكني', 'صك', 'استوديو', 'مكتب اداري', 'معرض تجاري', 'مستودع',
  'غرف', 'حي', 'مربع', 'واجهة', 'شمالية', 'جنوبية', 'غرفتين', 'صالة', 'حوش',
];

/** هل يبدو نص الإعلان (عنوان + تفاصيل) عقارياً؟ محلي بالكامل، لا يفشل أبداً. */
export function isRealEstateText(title: string, detail: string): boolean {
  const text = normalizeAr(`${title} ${title} ${detail}`);
  for (const kw of STRONG) {
    const nkw = normalizeAr(kw);
    if (nkw.length >= 2 && text.includes(nkw)) return true;
  }
  let weakHits = 0;
  for (const kw of WEAK) {
    const nkw = normalizeAr(kw);
    if (nkw.length >= 2 && text.includes(nkw)) {
      weakHits += 1;
      if (weakHits >= 2) return true;
    }
  }
  return false;
}

// مفاتيح لوحة التحكّم (قاعدة 1: كل ميزة قابلة للتحكّم من الإدارة).
export const SETTING_REALESTATE_ENABLED = 'realestate_enabled';
export const SETTING_REALESTATE_BLOCK_MSG = 'realestate_block_msg';
export const DEFAULT_REALESTATE_BLOCK_MSG =
  'الإعلانات العقارية موقوفة مؤقتاً لدى المنصّة لاستكمال متطلبات الترخيص النظامية (الهيئة العامة للعقار). نعتذر عن الإزعاج، وسنعيد تفعيلها قريباً.';

/** هل نشر الإعلانات العقارية مسموح حالياً؟ مفعّل افتراضياً — لا يتغيّر شيء حتى
 *  توقفه الإدارة صراحةً من لوحة التحكّم. */
export async function realEstateEnabled(): Promise<boolean> {
  return getSettingBool(SETTING_REALESTATE_ENABLED, true);
}

/** نص الرسالة المعروضة للعضو عند محاولة نشر إعلان عقاري أثناء الإيقاف. */
export async function realEstateBlockMsg(): Promise<string> {
  return getSetting(SETTING_REALESTATE_BLOCK_MSG, DEFAULT_REALESTATE_BLOCK_MSG);
}
