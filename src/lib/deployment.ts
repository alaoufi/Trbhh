import 'server-only';
import { getSetting, setSetting } from './settings';

/**
 * هوية النشر (أي موقع تُخدَم هذه النسخة الآن) + حارس ملكية قاعدة البيانات.
 *
 * تربح وعقار **نشرتان منفصلتان لنفس الكود، لكل منهما قاعدة بياناتها**. الفصل
 * الكامل للمحتوى مضمون بالبناء ما دامت كل نشرة تشير إلى قاعدتها هي. الخطر
 * الوحيد: أن تُشير نشرة عقار — سهواً أو بنسخة مستنسخة — إلى قاعدة تربح، فتظهر
 * بيانات تربح داخل عقار (طلبات توثيق، إعلانات…). هذا الحارس يكشف تلك الحالة
 * ويرفعها للإدارة بوضوح، بلا حجب للموقع.
 */

/** معرّف النشرة الحالية من البيئة (trbhh افتراضاً). النشرة العقارية تضبط SITE_ID=agar. */
export const SITE_ID = ((process.env.SITE_ID || 'trbhh').toLowerCase().trim()) || 'trbhh';

/** أسماء المواقع للعرض في التحذيرات. */
export const SITE_LABELS: Record<string, string> = {
  trbhh: 'تربح',
  agar: 'تربح للعقار',
};
export const siteLabel = (id: string) => SITE_LABELS[id] ?? id;

export type DbOwnership =
  | { ok: true; owner: string }
  /** القاعدة مبصومة لموقع آخر — قاعدة مشتركة/مستنسخة، البيانات مختلطة. */
  | { ok: false; owner: string; expected: string };

let cached: DbOwnership | null = null;

/**
 * يتأكّد أن هذه النشرة متصلة بقاعدتها هي. عند أول إقلاع لقاعدة نظيفة (لا بصمة)
 * يبصمها باسم النشرة. إن كانت مبصومة لموقع آخر يُعيد `ok:false` (تحذير فقط).
 *
 * إعادة المطالبة بعد فصل/تنظيف القاعدة: شغّل النشرة مرة واحدة بـ SITE_ID_CLAIM=1
 * فتُعاد بصمة القاعدة للموقع الحالي، ثم أزِل المتغيّر.
 */
export async function checkDbOwnership(): Promise<DbOwnership> {
  if (cached) return cached;
  const claim = process.env.SITE_ID_CLAIM === '1';
  let owner = (await getSetting('db_site_owner', '').catch(() => '')).trim().toLowerCase();
  if (!owner || claim) {
    await setSetting('db_site_owner', SITE_ID).catch(() => {});
    owner = SITE_ID;
  }
  cached = owner === SITE_ID ? { ok: true, owner } : { ok: false, owner, expected: SITE_ID };
  return cached;
}
