/** أيام الظهور المجاني الفعلية عند تفعيل «رسوم ظهور الإعلانات»: لا تقل عن الحد الأدنى،
 *  حتى لا يولد إعلان مخفياً ولا تختفي الإعلانات الحالية دفعة واحدة عند التفعيل. */
export const PLATFORM_AD_MIN_FREE_DAYS = 30;
export function effectiveFreeDays(configured: number): number {
  const n = Number.isFinite(configured) ? Math.floor(configured) : 0;
  return n > 0 ? n : PLATFORM_AD_MIN_FREE_DAYS;
}
export function freeUntil(now: Date, configured: number): Date {
  return new Date(now.getTime() + effectiveFreeDays(configured) * 86400000);
}
