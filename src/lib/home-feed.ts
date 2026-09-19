/** One continuous grid: priority groups first, each advertisement only once. */
export function mergeHomeAds<T extends { id: number | string }>(...groups: readonly T[][]): T[] {
  const seen = new Set<T['id']>();
  return groups.flat().filter(ad => {
    if (seen.has(ad.id)) return false;
    seen.add(ad.id);
    return true;
  });
}
