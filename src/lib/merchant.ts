import 'server-only';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

async function logoUrl(logoId: number | null): Promise<string> {
  if (!logoId) return PLACEHOLDER;
  const up = await prisma.uploads.findUnique({ where: { id: BigInt(logoId) } });
  return up?.file_name ? mediaUrl(up.file_name) : PLACEHOLDER;
}

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
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN home_featured TINYINT NOT NULL DEFAULT 0`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN layout VARCHAR(16) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN catalog VARCHAR(16) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN catalog_fields VARCHAR(120) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN activity_since VARCHAR(20) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN specialty VARCHAR(120) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN audience VARCHAR(160) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN show_on_platform TINYINT NOT NULL DEFAULT 0`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN national_id VARCHAR(30) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN store_phone VARCHAR(24) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN store_email VARCHAR(120) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN contacts VARCHAR(500) NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN terms_agreed TINYINT NOT NULL DEFAULT 0`).catch(() => {});
  // offers: store↔store collaboration ('collab') and admin→store home feature ('home')
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS store_offers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_store INT NOT NULL,
      to_store INT NOT NULL,
      kind VARCHAR(12) NOT NULL,
      status TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_offer (from_store, to_store, kind)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
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
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN terms_agreed_at TIMESTAMP NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS store_warnings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL, reason VARCHAR(300) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
  ensured = true;
}

export type StoreMeta = { storeName: string | null; color: string | null; about: string | null; banner: string | null; tagline: string | null; layout: string | null; catalog: string | null; fields: string | null; since: string | null; specialty: string | null; audience: string | null; onPlatform: boolean; nationalId: string | null; phone: string | null; email: string | null; contacts: string | null; termsAgreed: boolean; termsAgreedAt: string | null; status: number };

export async function getStoreMeta(storeId: number): Promise<StoreMeta> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ store_name: string | null; brand_color: string | null; about: string | null; banner: string | null; tagline: string | null; layout: string | null; catalog: string | null; catalog_fields: string | null; activity_since: string | null; specialty: string | null; audience: string | null; show_on_platform: number | bigint | null; national_id: string | null; store_phone: string | null; store_email: string | null; contacts: string | null; terms_agreed: number | bigint | null; terms_agreed_at: Date | null; status: number | bigint }[]>(
    `SELECT store_name, brand_color, about, banner, tagline, layout, catalog, catalog_fields, activity_since, specialty, audience, show_on_platform, national_id, store_phone, store_email, contacts, terms_agreed, terms_agreed_at, status FROM stores WHERE id = ?`, storeId,
  ).catch(() => []);
  const r = rows[0];
  return { storeName: r?.store_name ?? null, color: r?.brand_color ?? null, about: r?.about ?? null, banner: r?.banner ?? null, tagline: r?.tagline ?? null, layout: r?.layout ?? null, catalog: r?.catalog ?? null, fields: r?.catalog_fields ?? null, since: r?.activity_since ?? null, specialty: r?.specialty ?? null, audience: r?.audience ?? null, onPlatform: Number(r?.show_on_platform ?? 0) === 1, nationalId: r?.national_id ?? null, phone: r?.store_phone ?? null, email: r?.store_email ?? null, contacts: r?.contacts ?? null, termsAgreed: Number(r?.terms_agreed ?? 0) === 1, termsAgreedAt: r?.terms_agreed_at ? new Date(r.terms_agreed_at).toISOString() : null, status: Number(r?.status ?? 1) };
}

/* ---- Warnings & admin store oversight ---- */

/** All warnings issued against a store (newest first). */
export async function getStoreWarnings(storeId: number): Promise<{ id: number; reason: string | null; at: string | null }[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number | bigint; reason: string | null; created_at: Date | null }[]>(
    `SELECT id, reason, created_at FROM store_warnings WHERE store_id = ? ORDER BY id DESC`, storeId,
  ).catch(() => []);
  return rows.map((r) => ({ id: Number(r.id), reason: r.reason ?? null, at: r.created_at ? new Date(r.created_at).toISOString() : null }));
}

export async function warningsCount(storeId: number): Promise<number> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) n FROM store_warnings WHERE store_id = ?`, storeId).catch(() => []);
  return Number(rows[0]?.n || 0);
}

/** Issue a violation warning. On the 3rd warning the store is auto-suspended;
 *  earlier warnings are kept on record. Returns the new count + suspension state. */
export async function addStoreWarning(storeId: number, reason: string): Promise<{ count: number; suspended: boolean }> {
  await ensure();
  await prisma.$executeRawUnsafe(`INSERT INTO store_warnings (store_id, reason) VALUES (?, ?)`, storeId, reason.slice(0, 300) || null).catch(() => {});
  const count = await warningsCount(storeId);
  let suspended = false;
  if (count >= 3) { await setStoreStatus(storeId, 2); suspended = true; }
  return { count, suspended };
}

export type AdminStore = {
  id: number; userId: number; ownerName: string; storeName: string | null; status: number; createdAt: string | null;
  specialty: string | null; audience: string | null; since: string | null;
  phone: string | null; email: string | null; contacts: string | null; nationalId: string | null;
  onPlatform: boolean; termsAgreed: boolean; termsAgreedAt: string | null;
  followers: number; ratingAvg: number; ratingCount: number; adsCount: number;
  warnings: { id: number; reason: string | null; at: string | null }[];
};

/** Full oversight list for the admin store manager (all stores, richest first). */
export async function adminStoreList(): Promise<AdminStore[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number | bigint; user_id: number; store_name: string | null; status: number | bigint; created_at: Date | null; activity_since: string | null; specialty: string | null; audience: string | null; store_phone: string | null; store_email: string | null; contacts: string | null; national_id: string | null; show_on_platform: number | bigint | null; terms_agreed: number | bigint | null; terms_agreed_at: Date | null }[]>(
    `SELECT id, user_id, store_name, status, created_at, activity_since, specialty, audience, store_phone, store_email, contacts, national_id, show_on_platform, terms_agreed, terms_agreed_at FROM stores ORDER BY status ASC, id DESC LIMIT 200`,
  ).catch(() => []);
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map((r) => Number(r.user_id)))];
  const users = await prisma.users.findMany({ where: { id: { in: userIds.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } });
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'عضو']));
  const out: AdminStore[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    const [followers, rating, adsCount, warnings] = await Promise.all([
      followersCount(id), getStoreRating(id),
      prisma.ads.count({ where: { user_id: BigInt(Number(r.user_id)), status: 1 } }).catch(() => 0),
      getStoreWarnings(id),
    ]);
    out.push({
      id, userId: Number(r.user_id), ownerName: nameById.get(Number(r.user_id)) || 'عضو', storeName: r.store_name ?? null,
      status: Number(r.status ?? 1), createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      specialty: r.specialty ?? null, audience: r.audience ?? null, since: r.activity_since ?? null,
      phone: r.store_phone ?? null, email: r.store_email ?? null, contacts: r.contacts ?? null, nationalId: r.national_id ?? null,
      onPlatform: Number(r.show_on_platform ?? 0) === 1, termsAgreed: Number(r.terms_agreed ?? 0) === 1, termsAgreedAt: r.terms_agreed_at ? new Date(r.terms_agreed_at).toISOString() : null,
      followers, ratingAvg: rating.avg, ratingCount: rating.count, adsCount, warnings,
    });
  }
  return out;
}

/** Save branding fields on the caller's store. */
export async function saveStoreMeta(userId: number, data: { storeName: string; color: string; about: string; banner: string; tagline: string; layout: string; catalog: string; fields: string; since: string; specialty: string; audience: string; onPlatform: boolean; nationalId: string; phone: string; email: string; contacts: string }) {
  await ensure();
  const { isCatalogStyle, cleanFields, DEFAULT_CATALOG_FIELDS } = await import('./store-style');
  const banner = ['gradient', 'mesh', 'aurora', 'sunset', 'night', 'solid'].includes(data.banner) ? data.banner : 'gradient';
  const layout = ['classic', 'modern', 'minimal', 'luxury', 'grid', 'bold'].includes(data.layout) ? data.layout : 'classic';
  const catalog = isCatalogStyle(data.catalog) ? data.catalog : 'tiles';
  const fields = cleanFields(data.fields || DEFAULT_CATALOG_FIELDS) || DEFAULT_CATALOG_FIELDS;
  await prisma.$executeRawUnsafe(
    `UPDATE stores SET store_name = ?, brand_color = ?, about = ?, banner = ?, tagline = ?, layout = ?, catalog = ?, catalog_fields = ?, activity_since = ?, specialty = ?, audience = ?, show_on_platform = ?, national_id = ?, store_phone = ?, store_email = ?, contacts = ? WHERE user_id = ?`,
    data.storeName.slice(0, 120) || null, /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : null, data.about.slice(0, 2000) || null, banner, data.tagline.slice(0, 160) || null, layout, catalog, fields,
    data.since.slice(0, 20) || null, data.specialty.slice(0, 120) || null, data.audience.slice(0, 160) || null, data.onPlatform ? 1 : 0,
    data.nationalId.slice(0, 30) || null, data.phone.slice(0, 24) || null, data.email.slice(0, 120) || null, data.contacts.slice(0, 500) || null, userId,
  ).catch(() => {});
}

/** Record that the owner agreed to the store terms (accountability). */
export async function agreeStoreTerms(userId: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`UPDATE stores SET terms_agreed = 1, terms_agreed_at = CURRENT_TIMESTAMP WHERE user_id = ?`, userId).catch(() => {});
}

/** Does this user own an admin-approved store? (its ads publish directly). */
export async function isApprovedStoreOwner(userId: number): Promise<boolean> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) n FROM stores WHERE user_id = ? AND status = 1`, userId).catch(() => []);
  return Number(rows[0]?.n || 0) > 0;
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

/**
 * Delete a store and ONLY its store-scoped data (branches, warnings, follows,
 * reviews, collaboration offers). Never touches the owner's platform account
 * or their ads — the user simply reverts to a normal member; their ads remain.
 */
export async function deleteStore(storeId: number) {
  await ensure();
  await prisma.$executeRawUnsafe(`DELETE FROM store_warnings WHERE store_id = ?`, storeId).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM store_follows WHERE store_id = ?`, storeId).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM store_reviews WHERE store_id = ?`, storeId).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM store_offers WHERE from_store = ? OR to_store = ?`, storeId, storeId).catch(() => {});
  await prisma.store_branches.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  await prisma.stores.delete({ where: { id: BigInt(storeId) } }).catch(() => {});
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

/* ---- store identity helpers ---- */
export async function storeIdOfUser(userId: number): Promise<number> {
  const r = await prisma.stores.findFirst({ where: { user_id: userId }, select: { id: true } });
  return r ? toInt(r.id) : 0;
}
async function ownerOfStore(storeId: number): Promise<number> {
  const r = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { user_id: true } });
  return r ? Number(r.user_id) : 0;
}

/** Rich card for a store — name, logo, and stats — used in invitations/partners. */
export async function storeCard(storeId: number) {
  await ensure();
  const s = await prisma.stores.findUnique({ where: { id: BigInt(storeId) } });
  if (!s) return null;
  const meta = await getStoreMeta(storeId);
  const owner = await prisma.users.findUnique({ where: { id: BigInt(s.user_id) }, select: { name: true, userName: true } });
  const logo = await logoUrl(s.logo);
  const ads = await prisma.ads.findMany({ where: { user_id: BigInt(s.user_id) }, select: { id: true, status: true } });
  const activeAds = ads.filter((a) => a.status === 1).length;
  const views = ads.length ? (await prisma.ads_views.count({ where: { ads_id: { in: ads.map((a) => a.id) } } }).catch(() => 0)) : 0;
  const [followers, rating] = await Promise.all([followersCount(storeId), getStoreRating(storeId)]);
  return {
    id: storeId,
    name: meta.storeName || owner?.name || owner?.userName || 'متجر',
    color: meta.color || '#3287da',
    logo,
    followers,
    views,
    ads: activeAds,
    rating: rating.count ? rating.avg : 0,
    ratingCount: rating.count,
  };
}

/* ---- collaboration & home-feature offers ---- */
export async function sendCollab(fromUserId: number, toStoreId: number): Promise<boolean> {
  await ensure();
  const fromStore = await storeIdOfUser(fromUserId);
  if (!fromStore || !toStoreId || fromStore === toStoreId) return false;
  await prisma.$executeRawUnsafe(
    `INSERT INTO store_offers (from_store, to_store, kind, status) VALUES (?, ?, 'collab', 0)
     ON DUPLICATE KEY UPDATE status = 0, created_at = CURRENT_TIMESTAMP`,
    fromStore, toStoreId,
  ).catch(() => {});
  return true;
}

/** Respond to an offer — only the receiving store's owner may accept/reject. */
export async function respondOffer(userId: number, offerId: number, accept: boolean) {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ to_store: number; kind: string }[]>(`SELECT to_store, kind FROM store_offers WHERE id = ?`, offerId).catch(() => []);
  const o = rows[0];
  if (!o) return;
  if ((await ownerOfStore(o.to_store)) !== userId) return; // not the receiver
  await prisma.$executeRawUnsafe(`UPDATE store_offers SET status = ? WHERE id = ?`, accept ? 1 : 2, offerId).catch(() => {});
  if (o.kind === 'home' && accept) {
    await prisma.$executeRawUnsafe(`UPDATE stores SET home_featured = 1 WHERE id = ?`, o.to_store).catch(() => {});
  }
}

/** Pending offers received by a store, with the sender's rich card. */
export async function incomingOffers(storeId: number) {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ id: number; from_store: number; kind: string }[]>(
    `SELECT id, from_store, kind FROM store_offers WHERE to_store = ? AND status = 0 ORDER BY id DESC`, storeId,
  ).catch(() => []);
  return Promise.all(rows.map(async (r) => ({ id: r.id, kind: r.kind, from: r.from_store ? await storeCard(r.from_store) : null })));
}

/** Accepted collaborator store ids (both directions). */
export async function collaboratorStoreIds(storeId: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ from_store: number; to_store: number }[]>(
    `SELECT from_store, to_store FROM store_offers WHERE kind='collab' AND status=1 AND (from_store=? OR to_store=?)`, storeId, storeId,
  ).catch(() => []);
  return [...new Set(rows.map((r) => (r.from_store === storeId ? r.to_store : r.from_store)))].filter(Boolean);
}

export async function isCollaborator(aStore: number, bStore: number): Promise<boolean> {
  const ids = await collaboratorStoreIds(aStore);
  return ids.includes(bStore);
}

/** Active ads of a store's collaborators, shaped for AdGrid (partner catalog). */
export async function collaboratorAds(storeId: number) {
  const ids = await collaboratorStoreIds(storeId);
  if (!ids.length) return [];
  const stores = await prisma.stores.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, select: { user_id: true } });
  const { getMyAds } = await import('./account');
  const out: { id: number; title: string; price: number; adsType: string; image: string; cityName: null; categoryName: null; createdAt: string | null; special: boolean; views: number; sellerName: null; sellerTrusted: boolean }[] = [];
  for (const s of stores) {
    const a = (await getMyAds(Number(s.user_id))).filter((x) => x.status === 1).slice(0, 4);
    for (const x of a) out.push({ id: x.id, title: x.title, price: x.price, adsType: x.adsType, image: x.image, cityName: null, categoryName: null, createdAt: x.createdAt, special: x.special, views: 0, sellerName: null, sellerTrusted: false });
  }
  return out.slice(0, 12);
}

/** Owners of stores shown on the Trbhh platform: admin-featured OR merchant
 *  opted-in — both only once the store itself is approved. */
export async function homeFeaturedOwnerIds(limit = 12): Promise<number[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ user_id: number }[]>(
    `SELECT user_id FROM stores WHERE status = 1 AND (home_featured = 1 OR show_on_platform = 1) ORDER BY home_featured DESC, id DESC LIMIT ?`, limit,
  ).catch(() => []);
  return rows.map((r) => Number(r.user_id));
}

/** Stores shown on the Trbhh platform, with their id/name for labelling. */
export async function homeFeaturedStores(limit = 6): Promise<{ userId: number; storeId: number; storeName: string | null }[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ user_id: number; id: number | bigint; store_name: string | null }[]>(
    `SELECT user_id, id, store_name FROM stores WHERE status = 1 AND (home_featured = 1 OR show_on_platform = 1) ORDER BY home_featured DESC, id DESC LIMIT ?`, limit,
  ).catch(() => []);
  return rows.map((r) => ({ userId: Number(r.user_id), storeId: Number(r.id), storeName: r.store_name ?? null }));
}

/** Active ads from platform stores, shaped for AdGrid + labelled "من متجر …". */
export async function homeFeaturedAds() {
  const stores = await homeFeaturedStores(6);
  if (!stores.length) return [];
  const { getMyAds } = await import('./account');
  const out: { id: number; title: string; price: number; adsType: string; image: string; cityName: null; categoryName: null; createdAt: string | null; special: boolean; views: number; sellerName: null; sellerTrusted: boolean; storeName: string | null; storeId: number }[] = [];
  for (const st of stores) {
    const label = st.storeName || (await getStoreMeta(st.storeId)).storeName;
    const a = (await getMyAds(st.userId)).filter((x) => x.status === 1).slice(0, 4);
    for (const x of a) out.push({ id: x.id, title: x.title, price: x.price, adsType: x.adsType, image: x.image, cityName: null, categoryName: null, createdAt: x.createdAt, special: x.special, views: 0, sellerName: null, sellerTrusted: false, storeName: label, storeId: st.storeId });
  }
  return out.slice(0, 12);
}

/** Admin asks a store to feature its products on the home page. */
export async function adminRequestHome(storeId: number) {
  await ensure();
  await prisma.$executeRawUnsafe(
    `INSERT INTO store_offers (from_store, to_store, kind, status) VALUES (0, ?, 'home', 0)
     ON DUPLICATE KEY UPDATE status = 0, created_at = CURRENT_TIMESTAMP`, storeId,
  ).catch(() => {});
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
