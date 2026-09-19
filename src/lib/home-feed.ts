import type { CategoryFormConfig } from './ad-categories/contracts';

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
