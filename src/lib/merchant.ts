import 'server-only';
import { cache } from 'react';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';
import { ensureSchema } from '@/data/schema-sync';
import { cached } from './redis';

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
const ensure = ensureSchema;

export type StoreMeta = { storeName: string | null; color: string | null; about: string | null; banner: string | null; tagline: string | null; layout: string | null; catalog: string | null; fields: string | null; since: string | null; specialty: string | null; audience: string | null; onPlatform: boolean; handle: string | null; nationalId: string | null; phone: string | null; email: string | null; contacts: string | null; termsAgreed: boolean; termsAgreedAt: string | null; allowAds: boolean; allowReviews: boolean; msgTemplates: string | null; hiddenFields: string | null; announce: string | null; productNote: string | null; status: number };

/** Storefront elements each merchant can independently show/hide (کل متجر منفصل). */
export const STORE_HIDE_FIELDS = [
  { key: 'ads', label: 'عدد الإعلانات' },
  { key: 'views', label: 'المشاهدات' },
  { key: 'followers', label: 'المتابعون' },
  { key: 'rating', label: 'التقييم والتعليقات' },
  { key: 'about', label: 'نبذة المتجر' },
] as const;
export const STORE_HIDE_KEYS = STORE_HIDE_FIELDS.map((f) => f.key) as readonly string[];
/** Parse the CSV of hidden element keys into a lookup set. */
export function parseHiddenFields(raw: string | null | undefined): Set<string> {
  return new Set((raw || '').split(',').map((s) => s.trim()).filter((s) => STORE_HIDE_KEYS.includes(s)));
}

async function getStoreMetaImpl(storeId: number): Promise<StoreMeta> {
  await ensure();
  const r = Number.isInteger(storeId) && storeId > 0
    ? await prisma.stores.findUnique({ where: { id: BigInt(storeId) } }).catch(() => null)
    : null;
  return { storeName: r?.store_name ?? null, color: r?.brand_color ?? null, about: r?.about ?? null, banner: r?.banner ?? null, tagline: r?.tagline ?? null, layout: r?.layout ?? null, catalog: r?.catalog ?? null, fields: r?.catalog_fields ?? null, since: r?.activity_since ?? null, specialty: r?.specialty ?? null, audience: r?.audience ?? null, onPlatform: (r?.show_on_platform ?? 0) === 1, handle: r?.handle ?? null, nationalId: r?.national_id ?? null, phone: r?.store_phone ?? null, email: r?.store_email ?? null, contacts: r?.contacts ?? null, termsAgreed: (r?.terms_agreed ?? 0) === 1, termsAgreedAt: r?.terms_agreed_at ? r.terms_agreed_at.toISOString() : null, allowAds: (r?.allow_ads ?? 1) === 1, allowReviews: (r?.allow_reviews ?? 1) === 1, msgTemplates: r?.msg_templates ?? null, hiddenFields: r?.hidden_fields ?? null, announce: r?.announce ?? null, productNote: r?.product_note ?? null, status: r?.status ?? 1 };
}

/* ---- Warnings & admin store oversight ---- */

/** All warnings issued against a store (newest first). */
export async function getStoreWarnings(storeId: number): Promise<{ id: number; reason: string | null; at: string | null }[]> {
  await ensure();
  const rows = await prisma.store_warnings.findMany({ where: { store_id: storeId }, orderBy: { id: 'desc' } }).catch(() => []);
  return rows.map((r) => ({ id: r.id, reason: r.reason ?? null, at: r.created_at ? r.created_at.toISOString() : null }));
}

export async function warningsCount(storeId: number): Promise<number> {
  await ensure();
  return prisma.store_warnings.count({ where: { store_id: storeId } }).catch(() => 0);
}

/** Issue a violation warning. On the 3rd warning the store is auto-suspended;
 *  earlier warnings are kept on record. Returns the new count + suspension state. */
export async function addStoreWarning(storeId: number, reason: string): Promise<{ count: number; suspended: boolean }> {
  await ensure();
  await prisma.store_warnings.create({ data: { store_id: storeId, reason: reason.slice(0, 300) || null } }).catch(() => {});
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
  const rows = await prisma.stores.findMany({ orderBy: [{ status: 'asc' }, { id: 'desc' }], take: 200 }).catch(() => []);
  if (!rows.length) return [];
  const ids = rows.map((r) => toInt(r.id));
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  // one round of grouped queries instead of 4 per store (the old N+1)
  const [users, followRows, reviewRows, adRows, warnRows] = await Promise.all([
    prisma.users.findMany({ where: { id: { in: userIds.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }),
    prisma.store_follows.groupBy({ by: ['store_id'], where: { store_id: { in: ids } }, _count: { _all: true } }).catch(() => []),
    prisma.store_reviews.groupBy({ by: ['store_id'], where: { store_id: { in: ids } }, _avg: { star: true }, _count: { _all: true } }).catch(() => []),
    prisma.ads.groupBy({ by: ['user_id'], where: { user_id: { in: userIds.map((u) => BigInt(u)) }, status: 1 }, _count: { _all: true } }).catch(() => []),
    prisma.store_warnings.findMany({ where: { store_id: { in: ids } }, orderBy: { id: 'desc' } }).catch(() => []),
  ]);
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'عضو']));
  const followsBy = new Map(followRows.map((f) => [f.store_id, f._count._all]));
  const reviewsBy = new Map(reviewRows.map((f) => [f.store_id, { avg: f._avg.star ? Math.round(Number(f._avg.star) * 10) / 10 : 0, count: f._count._all }]));
  const adsBy = new Map(adRows.map((a) => [toInt(a.user_id), a._count._all]));
  const warnsBy = new Map<number, { id: number; reason: string | null; at: string | null }[]>();
  for (const w of warnRows) {
    if (!warnsBy.has(w.store_id)) warnsBy.set(w.store_id, []);
    warnsBy.get(w.store_id)!.push({ id: w.id, reason: w.reason ?? null, at: w.created_at ? w.created_at.toISOString() : null });
  }
  return rows.map((r) => {
    const id = toInt(r.id);
    const rating = reviewsBy.get(id) ?? { avg: 0, count: 0 };
    return {
      id, userId: r.user_id, ownerName: nameById.get(r.user_id) || 'عضو', storeName: r.store_name ?? null,
      status: r.status, createdAt: r.created_at ? r.created_at.toISOString() : null,
      specialty: r.specialty ?? null, audience: r.audience ?? null, since: r.activity_since ?? null,
      phone: r.store_phone ?? null, email: r.store_email ?? null, contacts: r.contacts ?? null, nationalId: r.national_id ?? null,
      onPlatform: r.show_on_platform === 1, termsAgreed: r.terms_agreed === 1, termsAgreedAt: r.terms_agreed_at ? r.terms_agreed_at.toISOString() : null,
      followers: followsBy.get(id) ?? 0, ratingAvg: rating.avg, ratingCount: rating.count,
      adsCount: adsBy.get(r.user_id) ?? 0, warnings: warnsBy.get(id) ?? [],
    };
  });
}

/** Save branding fields on the caller's store. (show_on_platform is NOT set
 *  here — it is granted by admin via decidePlatformRequest.) */
export async function saveStoreMeta(userId: number, data: { storeName: string; color: string; about: string; banner: string; tagline: string; layout: string; catalog: string; fields: string; since: string; specialty: string; audience: string; nationalId: string; phone: string; email: string; contacts: string }) {
  await ensure();
  const { isCatalogStyle, cleanFields, DEFAULT_CATALOG_FIELDS } = await import('./store-style');
  const banner = ['gradient', 'mesh', 'aurora', 'sunset', 'night', 'solid'].includes(data.banner) ? data.banner : 'gradient';
  const layout = ['classic', 'modern', 'minimal', 'luxury', 'grid', 'bold'].includes(data.layout) ? data.layout : 'classic';
  const catalog = isCatalogStyle(data.catalog) ? data.catalog : 'tiles';
  const fields = cleanFields(data.fields || DEFAULT_CATALOG_FIELDS) || DEFAULT_CATALOG_FIELDS;
  await prisma.stores.updateMany({
    where: { user_id: userId },
    data: {
      store_name: data.storeName.slice(0, 120) || null,
      brand_color: /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : null,
      about: data.about.slice(0, 2000) || null,
      banner, tagline: data.tagline.slice(0, 160) || null, layout, catalog, catalog_fields: fields,
      activity_since: data.since.slice(0, 20) || null,
      specialty: data.specialty.slice(0, 120) || null,
      audience: data.audience.slice(0, 160) || null,
      national_id: data.nationalId.slice(0, 30) || null,
      store_phone: data.phone.slice(0, 24) || null,
      store_email: data.email.slice(0, 120) || null,
      contacts: data.contacts.slice(0, 500) || null,
    },
  }).catch(() => {});
}

/** Store owner toggles: allow publishing ads, lock/unlock reviews+comments, and
 *  the store's OWN quick-reply message templates (shown only to its customers). */
export async function saveStoreSettings(userId: number, data: { allowAds: boolean; allowReviews: boolean; msgTemplates: string; hidden: string[]; announce: string; productNote: string; hours?: { from: string; to: string; days: number[] } | null }) {
  await ensure();
  const { parseTemplates } = await import('./settings');
  const tpl = parseTemplates(data.msgTemplates).join('\n');
  const hidden = [...new Set(data.hidden.filter((k) => STORE_HIDE_KEYS.includes(k)))].join(',');
  const announce = data.announce.trim().slice(0, 300);
  const productNote = data.productNote.trim().slice(0, 300);
  // دوام المتجر: undefined = لا تغيير (الميزة موقوفة)، null = مسح الدوام، وإلا HH:MM + أرقام الأيام
  const hhmm = /^\d{1,2}:\d{2}$/;
  const hoursData = data.hours === undefined
    ? {}
    : data.hours && hhmm.test(data.hours.from) && hhmm.test(data.hours.to)
      ? { hours_from: data.hours.from, hours_to: data.hours.to, hours_days: data.hours.days.filter((d) => d >= 0 && d <= 6).join(',') || null }
      : { hours_from: null, hours_to: null, hours_days: null };
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { allow_ads: data.allowAds ? 1 : 0, allow_reviews: data.allowReviews ? 1 : 0, msg_templates: tpl || null, hidden_fields: hidden || null, announce: announce || null, product_note: productNote || null, ...hoursData } }).catch(() => {});
}

/** Record that the owner agreed to the store terms (accountability). */
export async function agreeStoreTerms(userId: number) {
  await ensure();
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { terms_agreed: 1, terms_agreed_at: new Date() } }).catch(() => {});
}

/* ---- store catalog (independent products) ----
 * A store is fully independent: it shows ONLY the ads the merchant explicitly
 * added to it — nothing from their platform ads leaks in automatically. */

/** Ad ids the merchant chose to showcase in the store. */
export async function storeProductAdIds(storeId: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.store_products.findMany({ where: { store_id: storeId }, select: { ad_id: true } }).catch(() => []);
  return rows.map((r) => r.ad_id);
}

/** Replace the store's showcased products (only the owner's own ads qualify). */
export async function setStoreProducts(userId: number, adIds: number[]) {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return;
  const uniq = [...new Set(adIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  const owned = uniq.length
    ? await prisma.ads.findMany({ where: { user_id: BigInt(userId), id: { in: uniq.map((n) => BigInt(n)) } }, select: { id: true } }).catch(() => [])
    : [];
  const valid = owned.map((a) => toInt(a.id));
  await prisma.store_products.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  if (valid.length) await prisma.store_products.createMany({ data: valid.map((ad_id) => ({ store_id: storeId, ad_id })), skipDuplicates: true }).catch(() => {});
}

/** Append a single owned ad to the store's showcase (used when publishing from the store). */
export async function addStoreProduct(userId: number, adId: number) {
  await ensure();
  // مالك المتجر، وإلا موظف متجر (عند تفعيل ميزة الموظفين) — يضيف منتجات باسم المتجر
  const storeId = (await storeIdOfUser(userId)) || (await staffStoreId(userId));
  if (!storeId || !adId) return;
  const owns = await prisma.ads.findFirst({ where: { id: BigInt(adId), user_id: BigInt(userId) }, select: { id: true } }).catch(() => null);
  if (!owns) return;
  await prisma.store_products.createMany({ data: [{ store_id: storeId, ad_id: adId }], skipDuplicates: true }).catch(() => {});
}

/* ---- موظفو المتجر (staff_on): يضيفهم المالك برقم الجوال ليضيفوا منتجات باسم المتجر ---- */

/** متجر يعمل فيه هذا العضو موظفاً (0 إن لم يوجد أو الميزة موقوفة). */
export async function staffStoreId(userId: number): Promise<number> {
  try {
    const { staffEnabled } = await import('./settings');
    if (!(await staffEnabled())) return 0;
    await ensure();
    const r = await prisma.store_staff.findFirst({ where: { user_id: BigInt(userId) }, select: { store_id: true } }).catch(() => null);
    return r?.store_id ?? 0;
  } catch { return 0; }
}

export type StaffMember = { userId: number; name: string; phone: string | null; at: string | null };

export async function listStoreStaff(storeId: number): Promise<StaffMember[]> {
  await ensure();
  const rows = await prisma.store_staff.findMany({ where: { store_id: storeId }, orderBy: { created_at: 'asc' } }).catch(() => []);
  if (!rows.length) return [];
  const users = await prisma.users.findMany({ where: { id: { in: rows.map((r) => r.user_id) } }, select: { id: true, name: true, userName: true, phoneNumber: true } }).catch(() => []);
  const by = new Map(users.map((u) => [toInt(u.id), u]));
  return rows.map((r) => {
    const u = by.get(toInt(r.user_id));
    return { userId: toInt(r.user_id), name: u?.name || u?.userName || `عضو #${toInt(r.user_id)}`, phone: u?.phoneNumber ?? null, at: r.created_at ? r.created_at.toISOString() : null };
  });
}

/** إضافة موظف برقم جواله — عضو مسجّل، ليس المالك، وبحدّ أقصى من الإعدادات. */
export async function addStoreStaffByPhone(ownerId: number, phone: string): Promise<{ ok: boolean; error?: string }> {
  await ensure();
  const storeId = await storeIdOfUser(ownerId);
  if (!storeId) return { ok: false, error: 'notfound' };
  const { toLocalSaudi } = await import('./sms');
  const { STORE_STAFF_MAX } = await import('./settings');
  const local = toLocalSaudi(phone.trim());
  if (!local) return { ok: false, error: 'notfound' };
  const user = await prisma.users.findFirst({ where: { phoneNumber: local }, select: { id: true } }).catch(() => null);
  if (!user) return { ok: false, error: 'notfound' };
  const uid = toInt(user.id);
  if (uid === ownerId) return { ok: false, error: 'self' };
  const count = await prisma.store_staff.count({ where: { store_id: storeId } }).catch(() => STORE_STAFF_MAX);
  if (count >= STORE_STAFF_MAX) return { ok: false, error: 'cap' };
  await prisma.store_staff.createMany({ data: [{ store_id: storeId, user_id: BigInt(uid) }], skipDuplicates: true }).catch(() => {});
  return { ok: true };
}

export async function removeStoreStaff(ownerId: number, staffUserId: number): Promise<void> {
  await ensure();
  const storeId = await storeIdOfUser(ownerId);
  if (!storeId) return;
  await prisma.store_staff.deleteMany({ where: { store_id: storeId, user_id: BigInt(staffUserId) } }).catch(() => {});
}

/** Active showcased ads of a store (its independent catalog). */
export async function storeCatalogAds(storeId: number, ownerUserId: number) {
  const ids = new Set(await storeProductAdIds(storeId));
  if (!ids.size) return [];
  const { getMyAds } = await import('./account');
  return (await getMyAds(ownerUserId)).filter((a) => a.status === 1 && ids.has(a.id));
}

/** Real view counts (from ads_views) for a set of ad ids → Map(adId → count). */
export async function adViewCounts(ids: number[]): Promise<Map<number, number>> {
  const uniq = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!uniq.length) return new Map();
  const rows = await prisma.ads_views
    .groupBy({ by: ['ads_id'], where: { ads_id: { in: uniq.map((n) => BigInt(n)) } }, _count: { _all: true } })
    .catch(() => [] as { ads_id: bigint; _count: { _all: number } }[]);
  return new Map(rows.map((r) => [Number(r.ads_id), r._count._all]));
}

/** Does this user own an admin-approved store? (its ads publish directly). */
export async function isApprovedStoreOwner(userId: number): Promise<boolean> {
  await ensure();
  return (await prisma.stores.count({ where: { user_id: userId, status: 1 } }).catch(() => 0)) > 0;
}

/** Mark a freshly-created store as pending admin approval. */
export async function markStorePending(userId: number) {
  await ensure();
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { status: 0 } }).catch(() => {});
}

export async function setStoreStatus(storeId: number, status: number) {
  await ensure();
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { status } }).catch(() => {});
}

/**
 * Delete a store and ONLY its store-scoped data (branches, warnings, follows,
 * reviews, collaboration offers). Never touches the owner's platform account
 * or their ads — the user simply reverts to a normal member; their ads remain.
 */
export async function deleteStore(storeId: number) {
  await ensure();
  await prisma.store_warnings.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  await prisma.store_follows.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  await prisma.store_reviews.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  await prisma.store_offers.deleteMany({ where: { OR: [{ from_store: storeId }, { to_store: storeId }] } }).catch(() => {});
  await prisma.store_branches.deleteMany({ where: { store_id: storeId } }).catch(() => {});
  await prisma.stores.delete({ where: { id: BigInt(storeId) } }).catch(() => {});
}

/* ---- followers ---- */
export async function toggleFollow(userId: number, storeId: number): Promise<boolean> {
  await ensure();
  const key = { store_id_user_id: { store_id: storeId, user_id: userId } };
  const ex = await prisma.store_follows.findUnique({ where: key }).catch(() => null);
  if (ex) {
    await prisma.store_follows.delete({ where: key }).catch(() => {});
    return false;
  }
  await prisma.store_follows.create({ data: { store_id: storeId, user_id: userId } }).catch(() => {});
  return true;
}
export async function isFollowing(userId: number, storeId: number): Promise<boolean> {
  await ensure();
  const r = await prisma.store_follows.findUnique({ where: { store_id_user_id: { store_id: storeId, user_id: userId } } }).catch(() => null);
  return r !== null;
}
export async function followersCount(storeId: number): Promise<number> {
  await ensure();
  return prisma.store_follows.count({ where: { store_id: storeId } }).catch(() => 0);
}

/* ---- reviews (rating + customer notes) ---- */
export async function rateStore(userId: number, storeId: number, star: number, note: string) {
  await ensure();
  // respect the owner's lock on reviews/comments
  const st = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { allow_reviews: true } }).catch(() => null);
  if (st && st.allow_reviews === 0) return;
  const s = Math.min(5, Math.max(1, Math.round(star) || 5));
  const noteVal = note.slice(0, 500) || null;
  await prisma.store_reviews.upsert({
    where: { store_id_user_id: { store_id: storeId, user_id: userId } },
    create: { store_id: storeId, user_id: userId, star: s, note: noteVal },
    update: { star: s, note: noteVal, created_at: new Date() },
  }).catch(() => {});
}
export async function getStoreRating(storeId: number): Promise<{ avg: number; count: number }> {
  await ensure();
  const agg = await prisma.store_reviews.aggregate({ where: { store_id: storeId }, _avg: { star: true }, _count: { _all: true } }).catch(() => null);
  return { avg: agg?._avg.star ? Math.round(Number(agg._avg.star) * 10) / 10 : 0, count: agg?._count._all ?? 0 };
}
export async function getStoreReviews(storeId: number) {
  await ensure();
  const rows = await prisma.store_reviews.findMany({ where: { store_id: storeId }, orderBy: { id: 'desc' }, take: 50 }).catch(() => []);
  const ids = [...new Set(rows.map((r) => r.user_id))].map((n) => BigInt(n));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'عميل']));
  return rows.map((r) => ({ id: r.id, author: nameOf.get(r.user_id) || 'عميل', star: r.star, note: r.note, at: r.created_at ? r.created_at.toISOString() : null }));
}

/** Approved store ids (for filtering the public list). */
export async function approvedStoreIds(): Promise<Set<number>> {
  await ensure();
  const rows = await prisma.stores.findMany({ where: { status: 1 }, select: { id: true } }).catch(() => []);
  return new Set(rows.map((r) => toInt(r.id)));
}

/* ---- store handle (subdomain / clean URL identity) ---- */

// subdomains that must never be claimed by a store handle
const RESERVED_HANDLES = new Set([
  'www', 'api', 'm', 'admin', 'mail', 'ftp', 'cdn', 'static', 'assets', 'app',
  'apps', 'store', 'stores', 'trbhh', 'ns1', 'ns2', 'blog', 'help', 'support',
  'account', 'login', 'register', 'media', 'img', 'images', 'dev', 'test', 'staging',
]);

/** Normalize a requested handle to a safe DNS-label slug (or '' if invalid). */
export function normalizeHandle(raw: string): string {
  const h = (raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 32);
  if (h.length < 3 || RESERVED_HANDLES.has(h)) return '';
  return h;
}

/* ---- independent store login (separate credentials → store dashboard) ---- */

/** Minimum length for the dedicated store password (kept short by request). */
export const STORE_PW_MIN = 4;

/** Normalize a store login username (separate from the subdomain handle). */
export function normalizeStoreUsername(raw: string): string {
  const u = (raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, 60);
  if (u.length < 3 || RESERVED_HANDLES.has(u)) return '';
  return u;
}

/** Owner sets/changes a dedicated password for logging into the store directly. */
export async function setStorePassword(userId: number, plain: string): Promise<boolean> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId || !plain || plain.length < STORE_PW_MIN) return false;
  const { hashPassword } = await import('./auth');
  const hash = await hashPassword(plain);
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { store_password: hash } }).catch(() => {});
  return true;
}

/** Owner sets/changes a dedicated login username (independent of the subdomain handle). */
export async function setStoreUsername(userId: number, raw: string): Promise<{ ok: boolean; username?: string; msg: string }> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return { ok: false, msg: 'لا يوجد متجر.' };
  if (!raw.trim()) { // clearing the username → fall back to logging in by the subdomain handle
    await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { store_username: null } }).catch(() => {});
    return { ok: true, username: '', msg: 'أُزيل اسم دخول المتجر.' };
  }
  const username = normalizeStoreUsername(raw);
  if (!username) return { ok: false, msg: 'اسم الدخول غير صالح (أحرف إنجليزية وأرقام و«. _ -» فقط، ٣ خانات فأكثر، وغير محجوز).' };
  // فريد عالمياً: لا يطابق اسم دخول متجر آخر، ولا اسم مستخدم أي عضو آخر في تربح
  const takenByStore = await prisma.stores.findFirst({ where: { store_username: username, id: { not: BigInt(storeId) } }, select: { id: true } }).catch(() => null);
  if (takenByStore) return { ok: false, msg: 'اسم الدخول مستخدم من متجر آخر — اختر غيره.' };
  const takenByUser = await prisma.users.findFirst({ where: { userName: username, id: { not: BigInt(userId) } }, select: { id: true } }).catch(() => null);
  if (takenByUser) return { ok: false, msg: 'اسم الدخول مستخدم من عضو آخر — اختر غيره.' };
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { store_username: username } }).catch(() => {});
  return { ok: true, username, msg: 'تم حفظ اسم دخول المتجر.' };
}

/** Forgot store credentials: verify the owner by their Trbhh phone, then RESET the
 *  store password (we can't reveal the hashed one) and return the login identifier +
 *  the new password to show once. Ensures a login username exists. */
export async function resetStoreCredentialsByPhone(phone: string): Promise<{ username: string; password: string } | null> {
  await ensure();
  const last9 = (phone || '').replace(/\D/g, '').slice(-9);
  if (last9.length < 9) return null;
  const user = await prisma.users.findFirst({ where: { phoneNumber: { contains: last9 } }, select: { id: true, userName: true } }).catch(() => null);
  if (!user) return null;
  const store = await prisma.stores.findFirst({ where: { user_id: Number(user.id) }, select: { id: true, handle: true, store_username: true } }).catch(() => null);
  if (!store) return null;
  // ensure a login identifier exists (username → handle → generated)
  let username = store.store_username || store.handle || '';
  if (!username) {
    username = `store${toInt(store.id)}`;
    await prisma.stores.updateMany({ where: { id: store.id }, data: { store_username: username } }).catch(() => {});
  }
  // generate a fresh 4-digit password and store it hashed
  const { randomInt } = await import('crypto');
  const password = String(randomInt(1000, 10000));
  const { hashPassword } = await import('./auth');
  const hash = await hashPassword(password);
  await prisma.stores.updateMany({ where: { id: store.id }, data: { store_password: hash } }).catch(() => {});
  return { username, password };
}

/** Current store-login credentials state for the owner dashboard. */
export async function getStoreLogin(userId: number): Promise<{ username: string | null; hasPassword: boolean }> {
  await ensure();
  const s = await prisma.stores.findFirst({ where: { user_id: userId }, select: { store_username: true, store_password: true } }).catch(() => null);
  return { username: s?.store_username ?? null, hasPassword: !!s?.store_password };
}

/** Does the caller's store have a dedicated login password set? */
export async function hasStorePassword(userId: number): Promise<boolean> {
  await ensure();
  const s = await prisma.stores.findFirst({ where: { user_id: userId }, select: { store_password: true } }).catch(() => null);
  return !!s?.store_password;
}

/** Verify store-login credentials (store username OR subdomain handle + store password). */
export async function storeLogin(login: string, plain: string): Promise<{ uid: number; name: string } | null> {
  await ensure();
  const raw = (login || '').trim();
  if (!raw || !plain) return null;
  const uname = normalizeStoreUsername(raw);
  const handle = normalizeHandle(raw);
  // prefer the dedicated login username; fall back to the subdomain handle
  let s = uname ? await prisma.stores.findFirst({ where: { store_username: uname }, select: { user_id: true, store_password: true } }).catch(() => null) : null;
  if (!s && handle) s = await prisma.stores.findFirst({ where: { handle }, select: { user_id: true, store_password: true } }).catch(() => null);
  if (!s?.store_password) return null;
  const { verifyPassword } = await import('./auth');
  if (!(await verifyPassword(plain, s.store_password))) return null;
  const u = await prisma.users.findUnique({ where: { id: BigInt(s.user_id) }, select: { name: true, userName: true } }).catch(() => null);
  return { uid: s.user_id, name: u?.name || u?.userName || 'متجر' };
}

/** Set the caller store's handle. Returns the outcome for UI feedback. */
export async function setStoreHandle(userId: number, raw: string): Promise<{ ok: boolean; handle?: string; msg: string }> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return { ok: false, msg: 'لا يوجد متجر.' };
  if (!raw.trim()) { // clearing the handle
    await prisma.stores.update({ where: { id: BigInt(storeId) }, data: { handle: null } }).catch(() => {});
    return { ok: true, handle: '', msg: 'أُزيل معرّف المتجر.' };
  }
  const handle = normalizeHandle(raw);
  if (!handle) return { ok: false, msg: 'المعرّف غير صالح (أحرف إنجليزية وأرقام و«-» فقط، ٣ خانات فأكثر، وغير محجوز).' };
  const taken = await prisma.stores.findFirst({ where: { handle, id: { not: BigInt(storeId) } }, select: { id: true } }).catch(() => null);
  if (taken) return { ok: false, msg: 'هذا المعرّف مستخدم من متجر آخر — اختر غيره.' };
  await prisma.stores.update({ where: { id: BigInt(storeId) }, data: { handle } }).catch(() => {});
  return { ok: true, handle, msg: 'تم حفظ معرّف المتجر.' };
}

/** Resolve a store id from its handle (for subdomain routing). */
export async function storeIdByHandle(handle: string): Promise<number> {
  await ensure();
  const h = normalizeHandle(handle);
  if (!h) return 0;
  const r = await prisma.stores.findFirst({ where: { handle: h }, select: { id: true } }).catch(() => null);
  return r ? toInt(r.id) : 0;
}

export async function getStoreHandle(storeId: number): Promise<string | null> {
  await ensure();
  const r = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { handle: true } }).catch(() => null);
  return r?.handle ?? null;
}

/* ---- store identity helpers ---- */
async function storeIdOfUserImpl(userId: number): Promise<number> {
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
  await prisma.store_offers.upsert({
    where: { from_store_to_store_kind: { from_store: fromStore, to_store: toStoreId, kind: 'collab' } },
    create: { from_store: fromStore, to_store: toStoreId, kind: 'collab', status: 0 },
    update: { status: 0, created_at: new Date() },
  }).catch(() => {});
  return true;
}

/** Respond to an offer — only the receiving store's owner may accept/reject. */
export async function respondOffer(userId: number, offerId: number, accept: boolean) {
  await ensure();
  const o = await prisma.store_offers.findUnique({ where: { id: offerId }, select: { to_store: true, kind: true } }).catch(() => null);
  if (!o) return;
  if ((await ownerOfStore(o.to_store)) !== userId) return; // not the receiver
  await prisma.store_offers.update({ where: { id: offerId }, data: { status: accept ? 1 : 2 } }).catch(() => {});
  if (o.kind === 'home' && accept) {
    await prisma.stores.updateMany({ where: { id: BigInt(o.to_store) }, data: { home_featured: 1 } }).catch(() => {});
  }
}

/** Pending offers received by a store, with the sender's rich card. */
export async function incomingOffers(storeId: number) {
  await ensure();
  const rows = await prisma.store_offers.findMany({
    where: { to_store: storeId, status: 0 }, orderBy: { id: 'desc' },
    select: { id: true, from_store: true, kind: true },
  }).catch(() => []);
  return Promise.all(rows.map(async (r) => ({ id: r.id, kind: r.kind, from: r.from_store ? await storeCard(r.from_store) : null })));
}

/** Accepted collaborator store ids (both directions). */
export async function collaboratorStoreIds(storeId: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.store_offers.findMany({
    where: { kind: 'collab', status: 1, OR: [{ from_store: storeId }, { to_store: storeId }] },
    select: { from_store: true, to_store: true },
  }).catch(() => []);
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
  const stores = await prisma.stores.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, select: { id: true, user_id: true } });
  const out: { id: number; title: string; price: number; adsType: string; image: string; cityName: null; categoryName: null; createdAt: string | null; special: boolean; urgent: boolean; views: number; sellerName: null; sellerTrusted: boolean }[] = [];
  for (const s of stores) {
    const a = (await storeCatalogAds(toInt(s.id), Number(s.user_id))).slice(0, 4);
    for (const x of a) out.push({ id: x.id, title: x.title, price: x.price, adsType: x.adsType, image: x.image, cityName: null, categoryName: null, createdAt: x.createdAt, special: x.special,
      urgent: false, views: 0, sellerName: null, sellerTrusted: false });
  }
  const vc = await adViewCounts(out.map((o) => o.id));
  for (const o of out) o.views = vc.get(o.id) ?? 0;
  return out.slice(0, 12);
}

/** Owners of stores shown on the Trbhh platform: admin-featured OR merchant
 *  opted-in — both only once the store itself is approved. */
export async function homeFeaturedOwnerIds(limit = 12): Promise<number[]> {
  await ensure();
  const rows = await prisma.stores.findMany({
    where: { status: 1, OR: [{ home_featured: 1 }, { AND: [{ show_on_platform: 1 }, { OR: [{ show_until: null }, { show_until: { gt: new Date() } }] }] }] },
    orderBy: [{ home_featured: 'desc' }, { id: 'desc' }], take: limit,
    select: { user_id: true },
  }).catch(() => []);
  return rows.map((r) => r.user_id);
}

/** Stores shown on the Trbhh platform, with their id/name for labelling. */
export async function homeFeaturedStores(limit = 6): Promise<{ userId: number; storeId: number; storeName: string | null }[]> {
  await ensure();
  const rows = await prisma.stores.findMany({
    where: { status: 1, OR: [{ home_featured: 1 }, { AND: [{ show_on_platform: 1 }, { OR: [{ show_until: null }, { show_until: { gt: new Date() } }] }] }] },
    orderBy: [{ home_featured: 'desc' }, { id: 'desc' }], take: limit,
    select: { user_id: true, id: true, store_name: true },
  }).catch(() => []);
  return rows.map((r) => ({ userId: r.user_id, storeId: toInt(r.id), storeName: r.store_name ?? null }));
}

/** Active ads from platform stores, shaped for AdGrid + labelled "من متجر …". */
export async function homeFeaturedAds() {
  // one getMyAds round per merchant — cache the assembled showcase briefly
  return cached('stores:home-ads', 120, () => loadHomeFeaturedAds());
}

async function loadHomeFeaturedAds() {
  const stores = await homeFeaturedStores(6);
  if (!stores.length) return [];
  const out: { id: number; title: string; price: number; adsType: string; image: string; cityName: null; categoryName: null; createdAt: string | null; special: boolean; urgent: boolean; views: number; sellerName: null; sellerTrusted: boolean; storeName: string | null; storeId: number }[] = [];
  for (const st of stores) {
    const label = st.storeName || (await getStoreMeta(st.storeId)).storeName;
    const a = (await storeCatalogAds(st.storeId, st.userId)).slice(0, 4);
    for (const x of a) out.push({ id: x.id, title: x.title, price: x.price, adsType: x.adsType, image: x.image, cityName: null, categoryName: null, createdAt: x.createdAt, special: x.special, urgent: false, views: 0, sellerName: null, sellerTrusted: false, storeName: label, storeId: st.storeId });
  }
  const vc = await adViewCounts(out.map((o) => o.id));
  for (const o of out) o.views = vc.get(o.id) ?? 0;
  return out.slice(0, 12);
}

/* ---- merchant-initiated platform request (show products on Trbhh) ----
 * The store's own promo card shows on Trbhh automatically once approved; but
 * showing the store's PRODUCTS in the Trbhh feed needs the merchant to request
 * it and store-management to approve (kind='platform', from_store=self). */

/** Merchant requests to feature their products on the Trbhh platform. */
export async function requestPlatform(userId: number): Promise<boolean> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return false;
  await prisma.store_offers.upsert({
    where: { from_store_to_store_kind: { from_store: storeId, to_store: 0, kind: 'platform' } },
    create: { from_store: storeId, to_store: 0, kind: 'platform', status: 0 },
    update: { status: 0, created_at: new Date() },
  }).catch(() => {});
  return true;
}

/** Current platform-request state for the merchant's store: none|pending|approved. */
export async function platformRequestState(storeId: number): Promise<'none' | 'pending' | 'approved'> {
  await ensure();
  const s = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { show_on_platform: true } }).catch(() => null);
  if (s?.show_on_platform === 1) return 'approved';
  const off = await prisma.store_offers.findUnique({ where: { from_store_to_store_kind: { from_store: storeId, to_store: 0, kind: 'platform' } }, select: { status: true } }).catch(() => null);
  return off && off.status === 0 ? 'pending' : 'none';
}

export type PlatformRequest = { storeId: number; storeName: string | null; ownerName: string; at: string | null };

/** Pending merchant requests to feature products on Trbhh (admin queue). */
export async function platformRequests(): Promise<PlatformRequest[]> {
  await ensure();
  const rows = await prisma.store_offers.findMany({ where: { kind: 'platform', status: 0 }, orderBy: { id: 'desc' }, take: 100 }).catch(() => []);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.from_store);
  const stores = await prisma.stores.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, select: { id: true, store_name: true, user_id: true } }).catch(() => []);
  const sById = new Map(stores.map((s) => [toInt(s.id), s]));
  const uids = [...new Set(stores.map((s) => s.user_id))].map((n) => BigInt(n));
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'تاجر']));
  return rows.map((r) => {
    const s = sById.get(r.from_store);
    return { storeId: r.from_store, storeName: s?.store_name ?? null, ownerName: s ? nameOf.get(s.user_id) || 'تاجر' : 'تاجر', at: r.created_at ? r.created_at.toISOString() : null };
  });
}

/** Admin approves (or rejects) a merchant's platform request. */
export async function decidePlatformRequest(storeId: number, approve: boolean) {
  await ensure();
  await prisma.store_offers.updateMany({ where: { from_store: storeId, to_store: 0, kind: 'platform' }, data: { status: approve ? 1 : 2 } }).catch(() => {});
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { show_on_platform: approve ? 1 : 0 } }).catch(() => {});
}

/** Approved stores shown automatically as promo cards on Trbhh (the store ad —
 *  independent of the products feed, which needs a separate approval).
 *  Cached briefly: each card is several queries and the home page is dynamic. */
export async function homeStoreCards(limit = 12) {
  return cached(`stores:cards:${limit}`, 120, () => loadHomeStoreCards(limit));
}
async function loadHomeStoreCards(limit: number) {
  await ensure();
  const rows = await prisma.stores.findMany({ where: { status: 1 }, orderBy: [{ home_featured: 'desc' }, { id: 'desc' }], take: limit, select: { id: true } }).catch(() => []);
  const cards = await Promise.all(rows.map((r) => storeCard(toInt(r.id))));
  return cards.filter(Boolean);
}

/** Admin asks a store to feature its products on the home page. */
export async function adminRequestHome(storeId: number) {
  await ensure();
  await prisma.store_offers.upsert({
    where: { from_store_to_store_kind: { from_store: 0, to_store: storeId, kind: 'home' } },
    create: { from_store: 0, to_store: storeId, kind: 'home', status: 0 },
    update: { status: 0, created_at: new Date() },
  }).catch(() => {});
}

/* ---- ownership transfer (two-party consent + admin execution) ----
 * Flow: the transferee requests (status 0) → the current owner approves
 * (status 1) → an admin executes the move (status 2). The store and all its
 * data (name, phone, email, followers, reviews, products) move with it. */

/** Step 1 — the transferee requests to receive a store. */
export async function requestStoreTransfer(transfereeUserId: number, storeId: number): Promise<{ ok: boolean; msg: string }> {
  await ensure();
  const owner = await ownerOfStore(storeId);
  if (!owner) return { ok: false, msg: 'المتجر غير موجود.' };
  if (owner === transfereeUserId) return { ok: false, msg: 'أنت مالك هذا المتجر بالفعل.' };
  if (await storeIdOfUser(transfereeUserId)) return { ok: false, msg: 'لا يمكنك استلام متجر وأنت تملك متجراً — احذف متجرك أولاً.' };
  await prisma.store_transfers.upsert({
    where: { store_id: storeId },
    create: { store_id: storeId, from_user: owner, to_user: transfereeUserId, status: 0 },
    update: { from_user: owner, to_user: transfereeUserId, status: 0, created_at: new Date(), approved_at: null, completed_at: null },
  }).catch(() => {});
  return { ok: true, msg: 'أُرسل طلب النقل. بانتظار موافقة صاحب المتجر ثم تنفيذ الإدارة.' };
}

/** Step 2 — the current owner approves (or rejects) the pending request. */
export async function respondStoreTransfer(ownerUserId: number, storeId: number, accept: boolean) {
  await ensure();
  const t = await prisma.store_transfers.findUnique({ where: { store_id: storeId } }).catch(() => null);
  if (!t || t.from_user !== ownerUserId || t.status !== 0) return;
  if (accept) await prisma.store_transfers.update({ where: { store_id: storeId }, data: { status: 1, approved_at: new Date() } }).catch(() => {});
  else await prisma.store_transfers.delete({ where: { store_id: storeId } }).catch(() => {});
}

/** Pending request awaiting THIS owner's approval (for their store page). */
export async function pendingTransferForOwner(ownerUserId: number) {
  await ensure();
  const t = await prisma.store_transfers.findFirst({ where: { from_user: ownerUserId, status: 0 } }).catch(() => null);
  if (!t) return null;
  const to = await prisma.users.findUnique({ where: { id: BigInt(t.to_user) }, select: { name: true, userName: true, phoneNumber: true } }).catch(() => null);
  return { storeId: t.store_id, toName: to?.name || to?.userName || 'عضو', toPhone: to?.phoneNumber || null };
}

export type PendingTransfer = { storeId: number; storeName: string | null; fromName: string; toName: string; toPhone: string | null; at: string | null };

/** Owner-approved transfers waiting for admin execution. */
export async function approvedTransfers(): Promise<PendingTransfer[]> {
  await ensure();
  const rows = await prisma.store_transfers.findMany({ where: { status: 1 }, orderBy: { id: 'desc' } }).catch(() => []);
  if (!rows.length) return [];
  const uids = [...new Set(rows.flatMap((r) => [r.from_user, r.to_user]))].map((n) => BigInt(n));
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids } }, select: { id: true, name: true, userName: true, phoneNumber: true } }) : [];
  const uById = new Map(users.map((u) => [toInt(u.id), u]));
  const stores = await prisma.stores.findMany({ where: { id: { in: rows.map((r) => BigInt(r.store_id)) } }, select: { id: true, store_name: true } }).catch(() => []);
  const sById = new Map(stores.map((s) => [toInt(s.id), s.store_name]));
  return rows.map((r) => {
    const from = uById.get(r.from_user); const to = uById.get(r.to_user);
    return {
      storeId: r.store_id, storeName: sById.get(r.store_id) ?? null,
      fromName: from?.name || from?.userName || 'المالك الأول',
      toName: to?.name || to?.userName || 'المنقول له', toPhone: to?.phoneNumber || null,
      at: r.approved_at ? r.approved_at.toISOString() : null,
    };
  });
}

/** Step 3 — admin executes: the store (with its identity + data) moves to the
 *  new owner. The old owner reverts to a normal member. */
export async function completeStoreTransfer(storeId: number): Promise<boolean> {
  await ensure();
  const t = await prisma.store_transfers.findUnique({ where: { store_id: storeId } }).catch(() => null);
  if (!t || t.status !== 1) return false;
  await prisma.stores.update({ where: { id: BigInt(storeId) }, data: { user_id: t.to_user } }).catch(() => {});
  await prisma.store_transfers.update({ where: { store_id: storeId }, data: { status: 2, completed_at: new Date() } }).catch(() => {});
  return true;
}

/** Pending stores for the admin approval queue. */
export async function getPendingStores() {
  await ensure();
  const rows = await prisma.stores.findMany({
    where: { status: 0 }, orderBy: { id: 'desc' }, take: 100,
    select: { id: true, user_id: true, store_name: true, created_at: true },
  }).catch(() => []);
  const ids = [...new Set(rows.map((r) => r.user_id))].map((n) => BigInt(n));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'تاجر']));
  return rows.map((r) => ({ id: toInt(r.id), owner: nameOf.get(r.user_id) || 'تاجر', storeName: r.store_name, at: r.created_at ? r.created_at.toISOString() : null }));
}

/* memoized per-request (React cache): tames repeated hot reads within one navigation */
export const getStoreMeta = cache(getStoreMetaImpl);
export const storeIdOfUser = cache(storeIdOfUserImpl);
