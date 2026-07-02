import 'server-only';
import { prisma } from './prisma';

export type Tier = 'gold' | 'silver' | '';

export type Package = {
  id: number;
  name: string;
  price: number;        // 0 => مجانية (free, no price shown)
  adsPerDay: number;    // 0 => unlimited
  gapHours: number;     // 0 => no waiting time between ads
  featuredSlots: number;// how many of the member's ads are pinned to the top (0 => none)
  featuredDays: number; // how many days each featured ad stays on top
  adDays: number;       // how long the member's regular ads stay visible (0 => unlimited)
  tier: Tier;           // ذهبي / فضي — shows a gold/silver star on the member's ads
  isDefault: boolean;   // the free plan applied to members without a subscription
  sort: number;         // ranking / order of the package
  active: boolean;
};

/** Permissive fallback used when no package is configured/assigned — never blocks posting. */
export const FREE_FALLBACK: Package = {
  id: 0, name: 'مجانية', price: 0, adsPerDay: 0, gapHours: 0,
  featuredSlots: 0, featuredDays: 0, adDays: 0, tier: '', isDefault: true, sort: 0, active: true,
};

type Row = {
  id: number; name: string; price: unknown; ads_per_day: number; gap_hours: number;
  featured_slots: number; featured_days: number; ad_days?: number; tier: string; is_default: number; sort: number; active: number;
};

function toPackage(r: Row): Package {
  return {
    id: Number(r.id),
    name: r.name,
    price: Number(r.price) || 0,
    adsPerDay: Number(r.ads_per_day) || 0,
    gapHours: Number(r.gap_hours) || 0,
    featuredSlots: Number(r.featured_slots) || 0,
    featuredDays: Number(r.featured_days) || 0,
    adDays: Number(r.ad_days) || 0,
    tier: (r.tier === 'gold' || r.tier === 'silver' ? r.tier : '') as Tier,
    isDefault: r.is_default === 1,
    sort: Number(r.sort) || 0,
    active: r.active === 1,
  };
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS packages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      ads_per_day INT NOT NULL DEFAULT 0,
      gap_hours INT NOT NULL DEFAULT 0,
      featured_slots INT NOT NULL DEFAULT 0,
      featured_days INT NOT NULL DEFAULT 0,
      tier VARCHAR(10) NOT NULL DEFAULT '',
      is_default TINYINT NOT NULL DEFAULT 0,
      sort INT NOT NULL DEFAULT 0,
      active TINYINT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE packages ADD COLUMN ad_days INT NOT NULL DEFAULT 0`).catch(() => {});
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_packages (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      package_id INT NOT NULL,
      expires_at DATETIME NULL,
      assigned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS featured_ads (
      ad_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      tier VARCHAR(10) NOT NULL DEFAULT '',
      until DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export async function getPackages(onlyActive = false): Promise<Package[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM packages ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort ASC, price ASC, id ASC`,
  ).catch(() => []);
  return rows.map(toPackage);
}

export async function getPackage(id: number): Promise<Package | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM packages WHERE id = ?`, id).catch(() => []);
  return rows[0] ? toPackage(rows[0]) : null;
}

export async function createPackage(p: Omit<Package, 'id'>) {
  await ensure();
  if (p.isDefault) await prisma.$executeRawUnsafe(`UPDATE packages SET is_default = 0`);
  await prisma.$executeRawUnsafe(
    `INSERT INTO packages (name, price, ads_per_day, gap_hours, featured_slots, featured_days, ad_days, tier, is_default, sort, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.name, p.price, p.adsPerDay, p.gapHours, p.featuredSlots, p.featuredDays, p.adDays, p.tier, p.isDefault ? 1 : 0, p.sort, p.active ? 1 : 0,
  );
}

export async function updatePackage(id: number, p: Omit<Package, 'id'>) {
  await ensure();
  if (p.isDefault) await prisma.$executeRawUnsafe(`UPDATE packages SET is_default = 0 WHERE id <> ?`, id);
  await prisma.$executeRawUnsafe(
    `UPDATE packages SET name = ?, price = ?, ads_per_day = ?, gap_hours = ?, featured_slots = ?, featured_days = ?, ad_days = ?, tier = ?, is_default = ?, sort = ?, active = ? WHERE id = ?`,
    p.name, p.price, p.adsPerDay, p.gapHours, p.featuredSlots, p.featuredDays, p.adDays, p.tier, p.isDefault ? 1 : 0, p.sort, p.active ? 1 : 0, id,
  );
}

export async function deletePackage(id: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`DELETE FROM packages WHERE id = ?`, id);
  await prisma.$executeRawUnsafe(`DELETE FROM user_packages WHERE package_id = ?`, id).catch(() => {});
}

export async function getDefaultPackage(): Promise<Package> {
  const list = await getPackages(true);
  return list.find((p) => p.isDefault) || list.find((p) => p.price === 0) || FREE_FALLBACK;
}

/** The effective package for a member (their subscription, else the free default). */
export async function getUserPackage(userId: number): Promise<Package> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ package_id: number; expires_at: Date | null }[]>(
    `SELECT package_id, expires_at FROM user_packages WHERE user_id = ?`, userId,
  ).catch(() => []);
  const sub = rows[0];
  if (sub && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now())) {
    const p = await getPackage(sub.package_id);
    if (p && p.active) return p;
  }
  return getDefaultPackage();
}

/** Bulk map of user_id -> assigned package_id (for the admin list). */
export async function getUserPackageMap(userIds: number[]): Promise<Map<number, number>> {
  await ensure();
  const map = new Map<number, number>();
  if (!userIds.length) return map;
  const rows = await prisma.$queryRawUnsafe<{ user_id: bigint; package_id: number }[]>(
    `SELECT user_id, package_id FROM user_packages WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
    ...userIds,
  ).catch(() => []);
  for (const r of rows) map.set(Number(r.user_id), Number(r.package_id));
  return map;
}

export type AdMeta = { tier: Tier; adDays: number };
/** Batch: effective package tier + ad lifetime for many ad owners (for card rendering). */
export async function getUsersAdMeta(userIds: number[]): Promise<Map<number, AdMeta>> {
  await ensure();
  const map = new Map<number, AdMeta>();
  const ids = [...new Set(userIds.filter(Boolean))];
  const def = await getDefaultPackage().catch(() => FREE_FALLBACK);
  const defMeta: AdMeta = { tier: def.tier, adDays: def.adDays };
  if (!ids.length) return map;
  // active packages keyed by id
  const pkgs = await getPackages(true).catch(() => []);
  const pkgById = new Map(pkgs.map((p) => [p.id, p]));
  const subs = await prisma.$queryRawUnsafe<{ user_id: bigint; package_id: number; expires_at: Date | null }[]>(
    `SELECT user_id, package_id, expires_at FROM user_packages WHERE user_id IN (${ids.map(() => '?').join(',')})`,
    ...ids,
  ).catch(() => []);
  const subByUser = new Map<number, { package_id: number; expires_at: Date | null }>();
  for (const s of subs) subByUser.set(Number(s.user_id), { package_id: Number(s.package_id), expires_at: s.expires_at });
  for (const uid of ids) {
    const sub = subByUser.get(uid);
    const active = sub && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());
    const p = active ? pkgById.get(sub!.package_id) : undefined;
    map.set(uid, p ? { tier: p.tier, adDays: p.adDays } : defMeta);
  }
  return map;
}

export async function assignUserPackage(userId: number, packageId: number | 0, days?: number) {
  await ensure();
  if (!packageId) {
    await prisma.$executeRawUnsafe(`DELETE FROM user_packages WHERE user_id = ?`, userId);
    return;
  }
  const expires = days && days > 0 ? new Date(Date.now() + days * 86400000) : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_packages (user_id, package_id, expires_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE package_id = VALUES(package_id), expires_at = VALUES(expires_at), assigned_at = CURRENT_TIMESTAMP`,
    userId, packageId, expires,
  );
}

/** Un-feature ads whose spotlight period elapsed. Call before reading featured ads. */
export async function sweepExpiredFeatured() {
  await ensure();
  const expired = await prisma.$queryRawUnsafe<{ ad_id: bigint }[]>(
    `SELECT ad_id FROM featured_ads WHERE until <= NOW()`,
  ).catch(() => []);
  if (!expired.length) return;
  for (const e of expired) {
    await prisma.ads.update({ where: { id: BigInt(e.ad_id) }, data: { adsSpecial: 'no' } }).catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM featured_ads WHERE until <= NOW()`).catch(() => {});
}

/** tier ranking map for currently-featured ads (gold ranks above silver). */
export async function getFeaturedTierMap(adIds: number[]): Promise<Map<number, Tier>> {
  await ensure();
  const map = new Map<number, Tier>();
  if (!adIds.length) return map;
  const rows = await prisma.$queryRawUnsafe<{ ad_id: bigint; tier: string }[]>(
    `SELECT ad_id, tier FROM featured_ads WHERE ad_id IN (${adIds.map(() => '?').join(',')})`,
    ...adIds,
  ).catch(() => []);
  for (const r of rows) map.set(Number(r.ad_id), (r.tier === 'gold' || r.tier === 'silver' ? r.tier : '') as Tier);
  return map;
}

/**
 * Apply a member's featured (تميز) package to a freshly-created ad: pin it to the
 * top for `featuredDays` days if they still have free featured slots in their plan.
 */
export async function applyFeaturedToNewAd(userId: number, adId: bigint, pkg: Package) {
  if (!pkg.featuredSlots || !pkg.featuredDays) return;
  await ensure();
  await sweepExpiredFeatured();
  // how many of this member's ads are currently featured?
  const active = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) AS c FROM featured_ads f JOIN ads a ON a.id = f.ad_id WHERE a.user_id = ? AND f.until > NOW()`,
    userId,
  ).catch(() => [{ c: BigInt(0) }]);
  if (Number(active[0]?.c || 0) >= pkg.featuredSlots) return;
  const until = new Date(Date.now() + pkg.featuredDays * 86400000);
  await prisma.ads.update({ where: { id: adId }, data: { adsSpecial: 'checked' } }).catch(() => {});
  await prisma.$executeRawUnsafe(
    `INSERT INTO featured_ads (ad_id, tier, until) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE tier = VALUES(tier), until = VALUES(until)`,
    adId, pkg.tier, until,
  );
}

/** Count of a member's ads posted since local midnight (for the daily cap). */
export async function countAdsToday(userId: number): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  return prisma.ads.count({ where: { user_id: BigInt(userId), created_at: { gte: dayStart } } }).catch(() => 0);
}

/** Timestamp of the member's most recent ad (for the gap-hours rule). */
export async function lastAdAt(userId: number): Promise<Date | null> {
  const row = await prisma.ads.findFirst({
    where: { user_id: BigInt(userId), created_at: { not: null } },
    orderBy: { created_at: 'desc' },
    select: { created_at: true },
  }).catch(() => null);
  return row?.created_at ?? null;
}
