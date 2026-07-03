import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

/**
 * Merchant-store extras layered on top of the base `stores` table:
 * branding (name/color/about), admin approval status, followers and reviews.
 * New columns/tables are self-provisioned (the legacy DB has no migrations).
 */
let ensured = false;
async function ensure() {
  if (ensured) return;
  // status default 1 so pre-existing stores stay visible; new stores are set to 0 (pending) on creation.
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN store_name VARCHAR(120) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN brand_color VARCHAR(9) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN about TEXT NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN banner VARCHAR(16) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN tagline VARCHAR(160) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN status TINYINT NOT NULL DEFAULT 1`).catch(() => {});
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS store_follows (
      store_id INT NOT NULL, user_id INT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (store_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS store_reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL, user_id INT NOT NULL,
      star TINYINT NOT NULL DEFAULT 5, note VARCHAR(500) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_store_user (store_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
  ensured = true;
}

export type StoreMeta = { storeName: string | null; color: string | null; about: string | null; banner: string | null; tagline: string | null; status: number };

export async function getStoreMeta(storeId: number): Promise<StoreMeta> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ store_name: string | null; brand_color: string | null; about: string | null; banner: string | null; tagline: string | null; status: number | bigint }[]>(
    `SELECT store_name, brand_color, about, banner, tagline, status FROM stores WHERE id = ?`, storeId,
  ).catch(() => []);
  const r = rows[0];
  return { storeName: r?.store_name ?? null, color: r?.brand_color ?? null, about: r?.about ?? null, banner: r?.banner ?? null, tagline: r?.tagline ?? null, status: Number(r?.status ?? 1) };
}

/** Save branding fields on the caller's store. */
export async function saveStoreMeta(userId: number, data: { storeName: string; color: string; about: string; banner: string; tagline: string }) {
  await ensure();
  const banner = ['gradient', 'mesh', 'aurora', 'sunset', 'night', 'solid'].includes(data.banner) ? data.banner : 'gradient';
  await prisma.$executeRawUnsafe(
    `UPDATE stores SET store_name = ?, brand_color = ?, about = ?, banner = ?, tagline = ? WHERE user_id = ?`,
    data.storeName.slice(0, 120) || null, /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : null, data.about.slice(0, 2000) || null, banner, data.tagline.slice(0, 160) || null, userId,
  ).catch(() => {});
}

/** Mark a freshly-created store as pending admin approval. */
export async function markStorePending(userId: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`UPDATE stores SET status = 0 WHERE user_id = ?`, userId).catch(() => {});
}

export async function setStoreStatus(storeId: number, status: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`UPDATE stores SET status = ? WHERE id = ?`, status, storeId).catch(() => {});
}

/* ---- followers ---- */
export async function toggleFollow(userId: number, storeId: number): Promise<boolean> {
  await ensure();
  const ex = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) n FROM store_follows WHERE store_id=? AND user_id=?`, storeId, userId).catch(() => []);
  if (Number(ex[0]?.n || 0) > 0) {
    await prisma.$executeRawUnsafe(`DELETE FROM store_follows WHERE store_id=? AND user_id=?`, storeId, userId).catch(() => {});
    return false;
  }
  await prisma.$executeRawUnsafe(`INSERT IGNORE INTO store_follows (store_id, user_id) VALUES (?, ?)`, storeId, userId).catch(() => {});
  return true;
}
export async function isFollowing(userId: number, storeId: number): Promise<boolean> {
  await ensure();
  const r = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) n FROM store_follows WHERE store_id=? AND user_id=?`, storeId, userId).catch(() => []);
  return Number(r[0]?.n || 0) > 0;
}
export async function followersCount(storeId: number): Promise<number> {
  await ensure();
  const r = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) n FROM store_follows WHERE store_id=?`, storeId).catch(() => []);
  return Number(r[0]?.n || 0);
}

/* ---- reviews (rating + customer notes) ---- */
export async function rateStore(userId: number, storeId: number, star: number, note: string) {
  await ensure();
  const s = Math.min(5, Math.max(1, Math.round(star) || 5));
  await prisma.$executeRawUnsafe(
    `INSERT INTO store_reviews (store_id, user_id, star, note) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE star = VALUES(star), note = VALUES(note), created_at = CURRENT_TIMESTAMP`,
    storeId, userId, s, note.slice(0, 500) || null,
  ).catch(() => {});
}
export async function getStoreRating(storeId: number): Promise<{ avg: number; count: number }> {
  await ensure();
  const r = await prisma.$queryRawUnsafe<{ avg: number | null; c: number | bigint }[]>(`SELECT AVG(star) avg, COUNT(*) c FROM store_reviews WHERE store_id=?`, storeId).catch(() => []);
  return { avg: r[0]?.avg ? Math.round(Number(r[0].avg) * 10) / 10 : 0, count: Number(r[0]?.c || 0) };
}
export async function getStoreReviews(storeId: number) {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number; user_id: number; star: number; note: string | null; created_at: Date | null }[]>(
    `SELECT id, user_id, star, note, created_at FROM store_reviews WHERE store_id=? ORDER BY id DESC LIMIT 50`, storeId,
  ).catch(() => []);
  const ids = [...new Set(rows.map((r) => r.user_id))].map((n) => BigInt(n));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'عميل']));
  return rows.map((r) => ({ id: r.id, author: nameOf.get(r.user_id) || 'عميل', star: r.star, note: r.note, at: r.created_at ? r.created_at.toISOString() : null }));
}

/** Approved store ids (for filtering the public list). */
export async function approvedStoreIds(): Promise<Set<number>> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number | bigint }[]>(`SELECT id FROM stores WHERE status = 1`).catch(() => []);
  return new Set(rows.map((r) => toInt(r.id)));
}

/** Pending stores for the admin approval queue. */
export async function getPendingStores() {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number | bigint; user_id: number; store_name: string | null; created_at: Date | null }[]>(
    `SELECT id, user_id, store_name, created_at FROM stores WHERE status = 0 ORDER BY id DESC LIMIT 100`,
  ).catch(() => []);
  const ids = [...new Set(rows.map((r) => r.user_id))].map((n) => BigInt(n));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'تاجر']));
  return rows.map((r) => ({ id: toInt(r.id), owner: nameOf.get(r.user_id) || 'تاجر', storeName: r.store_name, at: r.created_at ? r.created_at.toISOString() : null }));
}
