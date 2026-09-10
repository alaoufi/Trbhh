/** URL values are untrusted: reject malformed IDs and prices before querying. */
export function positiveSearchId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function normalizePriceRange(min: unknown, max: unknown) {
  const price = (value: unknown): number | undefined => {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim())) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 2147483647 ? n : undefined;
  };
  let minPrice = price(min);
  let maxPrice = price(max);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return { minPrice, maxPrice };
}

export function normalizeSearchParams(sp: Record<string, string | undefined>) {
  const range = normalizePriceRange(sp.minPrice, sp.maxPrice);
  return {
    q: sp.q?.trim().slice(0, 200) || undefined,
    cityId: positiveSearchId(sp.city),
    areaId: positiveSearchId(sp.area),
    type: sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined,
    sort: sp.sort === 'price_asc' || sp.sort === 'price_desc' ? sp.sort : 'newest',
    special: sp.special === '1',
    ...range,
  } as const;
}

export function canonicalAreaName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
}

/** Legacy imports can assign several IDs to the same city within one Saudi region. */
export function equivalentAreaIds(areas: { id: number; name: string; cityId: number }[], selectedId: number, regionId: number): number[] {
  const selected = areas.find((area) => area.id === selectedId && area.cityId === regionId);
  if (!selected) return [selectedId];
  const canonical = canonicalAreaName(selected.name);
  return [...new Set(areas.filter((area) => area.cityId === regionId && canonicalAreaName(area.name) === canonical).map((area) => area.id))];
}
