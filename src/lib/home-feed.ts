import type { CategoryFormConfig } from './ad-categories/contracts';

/**
 * يقسّم تغذية الرئيسية إلى: صفّ تشويقي صغير، ثم شريط «لمحة من السوق» الأفقي
 * الذي يضمّ **البقية** (قابل للسحب — يعرض أكبر عدد من الإعلانات)، ثم شبكة ختامية
 * اختيارية للفائض الكبير. الهدف: الشريط هو القسم الأغنى لا المجوّع.
 *   • أقل من ٨ إعلانات: شبكة واحدة بلا شريط (لا معنى لشريط شبه فارغ).
 *   • ٨ فأكثر: ٤ قبل الشريط، حتى ٢٠ داخل الشريط، والباقي شبكة بعده.
 */
const STRIP_LEAD = 4;
const STRIP_MAX = 20;
export function splitHomeFeed<T>(ads: readonly T[]): { before: T[]; strip: T[]; after: T[] } {
  if (ads.length < 8) return { before: [...ads], strip: [], after: [] };
  const stripEnd = STRIP_LEAD + STRIP_MAX;
  return { before: ads.slice(0, STRIP_LEAD), strip: ads.slice(STRIP_LEAD, stripEnd), after: ads.slice(stripEnd) };
}

/** Browsing includes legacy active categories without configured form fields. */
export function selectedHomeCategory(config: CategoryFormConfig | null, value?: string | string[]) {
  if (!config?.enabled || typeof value !== 'string' || !/^[1-9]\d{0,14}$/.test(value)) return undefined;
  return config.categories.find(category => category.active && String(category.id) === value);
}

/** One continuous grid: priority groups first, each advertisement only once. */
export function mergeHomeAds<T extends { id: number | string }>(...groups: readonly T[][]): T[] {
  const seen = new Set<T['id']>();
  return groups.flat().filter(ad => {
    if (seen.has(ad.id)) return false;
    seen.add(ad.id);
    return true;
  });
}
