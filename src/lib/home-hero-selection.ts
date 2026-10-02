export const HOME_HERO_AD_IDS = 'home_hero_ad_ids';
export const HOME_HERO_LIMIT = 10;

export function parseHomeHeroIds(value: string): number[] {
  const normalized = value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).trim();
  if (!normalized) return [];
  const tokens = normalized.split(/[\s,،]+/);
  if (tokens.some(t => !/^\d+$/.test(t) || !Number.isSafeInteger(Number(t)) || Number(t) <= 0)) throw new Error('أدخل أرقام إعلانات صحيحة فقط.');
  const ids = [...new Set(tokens.map(Number))];
  if (ids.length > HOME_HERO_LIMIT) throw new Error('يمكن اختيار عشرة إعلانات كحد أقصى.');
  return ids;
}
