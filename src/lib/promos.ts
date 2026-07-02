import 'server-only';
import { prisma } from './prisma';
import { mediaUrl } from './media';
import {
  type Promo, type PromoPackage, type PromoPlacement, type PromoStatus, isPlacement,
} from './promo-placements';

export type { Promo, PromoPackage, PromoPlacement };

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS promo_packages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      days INT NOT NULL DEFAULT 30,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      sort INT NOT NULL DEFAULT 0,
      active TINYINT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS promo_ads (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      placement VARCHAR(20) NOT NULL,
      title VARCHAR(255) NULL,
      body VARCHAR(500) NULL,
      image VARCHAR(255) NULL,
      phone VARCHAR(40) NULL,
      whatsapp VARCHAR(40) NULL,
      link VARCHAR(500) NULL,
      package_id INT NULL,
      days INT NOT NULL DEFAULT 30,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      clicks INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

/* ---------- packages ---------- */
type PkgRow = { id: number; name: string; days: number; price: unknown; sort: number; active: number };
const toPkg = (r: PkgRow): PromoPackage => ({
  id: Number(r.id), name: r.name, days: Number(r.days) || 0, price: Number(r.price) || 0,
  sort: Number(r.sort) || 0, active: r.active === 1,
});

export async function getPromoPackages(onlyActive = false): Promise<PromoPackage[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<PkgRow[]>(
    `SELECT * FROM promo_packages ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort ASC, days ASC, id ASC`,
  ).catch(() => []);
  return rows.map(toPkg);
}

export async function getPromoPackage(id: number): Promise<PromoPackage | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<PkgRow[]>(`SELECT * FROM promo_packages WHERE id = ?`, id).catch(() => []);
  return rows[0] ? toPkg(rows[0]) : null;
}

export async function createPromoPackage(p: Omit<PromoPackage, 'id'>) {
  await ensure();
  await prisma.$executeRawUnsafe(
    `INSERT INTO promo_packages (name, days, price, sort, active) VALUES (?, ?, ?, ?, ?)`,
    p.name, p.days, p.price, p.sort, p.active ? 1 : 0,
  );
}
export async function updatePromoPackage(id: number, p: Omit<PromoPackage, 'id'>) {
  await ensure();
  await prisma.$executeRawUnsafe(
    `UPDATE promo_packages SET name=?, days=?, price=?, sort=?, active=? WHERE id=?`,
    p.name, p.days, p.price, p.sort, p.active ? 1 : 0, id,
  );
}
export async function deletePromoPackage(id: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`DELETE FROM promo_packages WHERE id = ?`, id);
}

/* ---------- promo ads ---------- */
type Row = {
  id: bigint | number; user_id: bigint | number | null; placement: string;
  title: string | null; body: string | null; image: string | null; phone: string | null;
  whatsapp: string | null; link: string | null; days: number; price: unknown; status: string;
  starts_at: Date | null; ends_at: Date | null; created_at: Date | null;
};
function toPromo(r: Row): Promo {
  return {
    id: Number(r.id),
    userId: r.user_id == null ? null : Number(r.user_id),
    placement: (isPlacement(r.placement) ? r.placement : 'feed') as PromoPlacement,
    title: r.title, body: r.body,
    image: r.image ? mediaUrl(r.image) : null,
    phone: r.phone, whatsapp: r.whatsapp, link: r.link,
    days: Number(r.days) || 0, price: Number(r.price) || 0,
    status: (['pending', 'active', 'rejected', 'expired'].includes(r.status) ? r.status : 'pending') as PromoStatus,
    startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
    endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

/** Mark active promos whose period elapsed as expired. */
async function sweepExpired() {
  await prisma.$executeRawUnsafe(`UPDATE promo_ads SET status='expired' WHERE status='active' AND ends_at IS NOT NULL AND ends_at <= NOW()`).catch(() => {});
}

/** Active promos for a placement (rotated caller-side). */
export async function getActivePromos(placement: PromoPlacement, limit = 5): Promise<Promo[]> {
  await ensure();
  await sweepExpired();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM promo_ads WHERE placement = ? AND status='active' AND (ends_at IS NULL OR ends_at > NOW()) ORDER BY id DESC LIMIT ${Math.max(1, Math.min(20, limit))}`,
    placement,
  ).catch(() => []);
  return rows.map(toPromo);
}

export async function getPromoById(id: number): Promise<Promo | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM promo_ads WHERE id = ?`, id).catch(() => []);
  return rows[0] ? toPromo(rows[0]) : null;
}

export async function getMyPromos(userId: number): Promise<Promo[]> {
  await ensure();
  await sweepExpired();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM promo_ads WHERE user_id = ? ORDER BY id DESC LIMIT 100`, userId).catch(() => []);
  return rows.map(toPromo);
}

export async function listPromos(status?: PromoStatus): Promise<Promo[]> {
  await ensure();
  await sweepExpired();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    status ? `SELECT * FROM promo_ads WHERE status = ? ORDER BY id DESC LIMIT 200` : `SELECT * FROM promo_ads ORDER BY id DESC LIMIT 200`,
    ...(status ? [status] : []),
  ).catch(() => []);
  return rows.map(toPromo);
}

export async function countPendingPromos(): Promise<number> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(`SELECT COUNT(*) AS c FROM promo_ads WHERE status='pending'`).catch(() => [{ c: 0 }]);
  return Number(rows[0]?.c || 0);
}

export async function createPromo(data: {
  userId: number; placement: PromoPlacement; title: string | null; body: string | null;
  image: string | null; phone: string | null; whatsapp: string | null; link: string | null;
  days: number; price: number;
}): Promise<number> {
  await ensure();
  await prisma.$executeRawUnsafe(
    `INSERT INTO promo_ads (user_id, placement, title, body, image, phone, whatsapp, link, days, price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    data.userId, data.placement, data.title, data.body, data.image, data.phone, data.whatsapp, data.link, data.days, data.price,
  );
  const rows = await prisma.$queryRawUnsafe<{ id: bigint | number }[]>(`SELECT LAST_INSERT_ID() AS id`);
  return Number(rows[0]?.id || 0);
}

/** Approve → publish now for `days` days. */
export async function approvePromo(id: number) {
  await ensure();
  const p = await getPromoById(id);
  if (!p) return;
  const days = p.days > 0 ? p.days : 30;
  await prisma.$executeRawUnsafe(
    `UPDATE promo_ads SET status='active', starts_at=NOW(), ends_at=DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id=?`,
    days, id,
  );
}
export async function rejectPromo(id: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`UPDATE promo_ads SET status='rejected' WHERE id=?`, id);
}
export async function deletePromo(id: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`DELETE FROM promo_ads WHERE id=?`, id);
}
export async function recordPromoClick(id: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`UPDATE promo_ads SET clicks = clicks + 1 WHERE id = ?`, id).catch(() => {});
}
