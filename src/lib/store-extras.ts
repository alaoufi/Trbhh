import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getSettingBool } from './settings';

/* ميزات المتجر الإضافية — تفعيل/إيقاف عام من التحكم (الإعدادات ← الميزات التفاعلية). */
export const couponsEnabled = () => getSettingBool('coupons_on', false);
export const stockEnabled = () => getSettingBool('stock_on', false);
export const hoursEnabled = () => getSettingBool('hours_on', false);
export const dealsEnabled = () => getSettingBool('deals_on', false);

/* ===================== حالة توفر المنتج ===================== */

export const STOCK_LABELS = ['متوفر', 'نفدت الكمية', 'طلب مسبق'] as const;
/** ستايل شارة الحالة — لا شارة للحالة الافتراضية «متوفر». */
export const STOCK_BADGE: Record<number, { label: string; cls: string } | undefined> = {
  1: { label: 'نفدت الكمية', cls: 'bg-red-600 text-white' },
  2: { label: 'طلب مسبق', cls: 'bg-indigo-600 text-white' },
};

/* ===================== كوبونات المتجر ===================== */

export type StoreCoupon = { id: number; code: string; discount: string; active: boolean; expiresAt: string | null };

const toCoupon = (c: { id: number; code: string; discount: string; active: number; expires_at: Date | null }): StoreCoupon => ({
  id: c.id, code: c.code, discount: c.discount, active: c.active === 1,
  expiresAt: c.expires_at ? c.expires_at.toISOString().slice(0, 10) : null,
});

/** كوبونات المتجر — activeOnly: الفعّالة وغير المنتهية فقط (لواجهة المتجر). */
export async function listStoreCoupons(storeId: number, activeOnly = false): Promise<StoreCoupon[]> {
  await ensureSchema();
  const rows = await prisma.store_coupons.findMany({
    where: {
      store_id: storeId,
      ...(activeOnly ? { active: 1, OR: [{ expires_at: null }, { expires_at: { gte: new Date(new Date().toDateString()) } }] } : {}),
    },
    orderBy: { id: 'desc' },
    take: 20,
  }).catch(() => []);
  return rows.map(toCoupon);
}

export async function addStoreCoupon(storeId: number, code: string, discount: string, expiresAt: Date | null): Promise<boolean> {
  await ensureSchema();
  const c = code.trim().slice(0, 30);
  const d = discount.trim().slice(0, 80);
  if (!c || !d) return false;
  const count = await prisma.store_coupons.count({ where: { store_id: storeId } }).catch(() => 99);
  if (count >= 20) return false;
  await prisma.store_coupons.create({ data: { store_id: storeId, code: c, discount: d, expires_at: expiresAt } }).catch(() => {});
  return true;
}

export async function deleteStoreCoupon(storeId: number, id: number): Promise<void> {
  await ensureSchema();
  await prisma.store_coupons.deleteMany({ where: { id, store_id: storeId } }).catch(() => {});
}

export async function toggleStoreCoupon(storeId: number, id: number): Promise<void> {
  await ensureSchema();
  const c = await prisma.store_coupons.findFirst({ where: { id, store_id: storeId }, select: { active: true } }).catch(() => null);
  if (!c) return;
  await prisma.store_coupons.updateMany({ where: { id, store_id: storeId }, data: { active: c.active === 1 ? 0 : 1 } }).catch(() => {});
}

/* ===================== دوام المتجر ===================== */

export const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export type StoreHours = { from: string | null; to: string | null; days: number[] };

export const parseHoursDays = (s: string | null | undefined): number[] =>
  (s || '').split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);

/** مفتوح الآن؟ بتوقيت السعودية (UTC+3) — null إذا لم يحدد المتجر دواماً. يدعم الدوام العابر لمنتصف الليل. */
export function isOpenNow(h: StoreHours, nowMs = Date.now()): boolean | null {
  if (!h.from || !h.to || !/^\d{1,2}:\d{2}$/.test(h.from) || !/^\d{1,2}:\d{2}$/.test(h.to)) return null;
  const ksa = new Date(nowMs + 3 * 3600_000);
  if (h.days.length > 0 && !h.days.includes(ksa.getUTCDay())) return false;
  const cur = ksa.getUTCHours() * 60 + ksa.getUTCMinutes();
  const [fh, fm] = h.from.split(':').map(Number);
  const [th, tm] = h.to.split(':').map(Number);
  const f = fh * 60 + fm;
  const t = th * 60 + tm;
  if (f === t) return true; // ٢٤ ساعة
  return f < t ? cur >= f && cur < t : cur >= f || cur < t;
}

export async function getStoreHours(storeId: number): Promise<StoreHours> {
  await ensureSchema();
  const r = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { hours_from: true, hours_to: true, hours_days: true } }).catch(() => null);
  return { from: r?.hours_from ?? null, to: r?.hours_to ?? null, days: parseHoursDays(r?.hours_days) };
}
