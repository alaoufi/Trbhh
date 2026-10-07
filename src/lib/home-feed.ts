import type { CategoryFormConfig } from './ad-categories/contracts';

/** يقسّم تغذية الرئيسية إلى: قبل الشريط، شريط إعلانات صغيرة، بعده (تنويع بصري قابل للتحكم). */
export function splitHomeFeed<T>(ads: readonly T[]): { before: T[]; strip: T[]; after: T[] } {
  if (ads.length < 12) return { before: [...ads], strip: [], after: [] };
  const end = 6 + Math.min(12, ads.length - 10);
  return { before: ads.slice(0, 6), strip: ads.slice(6, end), after: ads.slice(end) };
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
