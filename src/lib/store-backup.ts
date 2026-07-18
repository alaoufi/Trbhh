import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { storeIdOfUser } from './merchant';
import { toInt } from './utils';
import { scanContent } from './content-guard';
import { handleProhibited } from './moderation';

const ensure = ensureSchema;

/** Store content/settings columns captured in a backup (identity/subscription are excluded on purpose). */
const CONTENT_FIELDS = [
  'store_name', 'brand_color', 'about', 'banner', 'tagline', 'layout', 'catalog', 'catalog_fields',
  'activity_since', 'specialty', 'audience', 'national_id', 'store_phone', 'store_email', 'contacts',
  'allow_ads', 'allow_reviews', 'msg_templates', 'hidden_fields', 'announce', 'product_note',
  'description', 'address',
] as const;

export type StoreBackup = { v: number; at: string; store: Record<string, unknown>; products: number[]; branches: { name: string; address: string | null }[] };
export type BackupMeta = { id: number; kind: string; at: string | null };

/** Build a JSON snapshot of the owner's store (settings + products + branches). */
async function buildSnapshot(userId: number, storeId: number): Promise<StoreBackup | null> {
  const row = await prisma.stores.findFirst({ where: { user_id: userId } }).catch(() => null);
  if (!row) return null;
  const [products, branches] = await Promise.all([
    prisma.store_products.findMany({ where: { store_id: storeId }, select: { ad_id: true } }).catch(() => []),
    prisma.store_branches.findMany({ where: { store_id: storeId }, select: { name: true, address: true } }).catch(() => []),
  ]);
  const store: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) store[f] = (row as unknown as Record<string, unknown>)[f] ?? null;
  return {
    v: 1,
    at: new Date().toISOString(),
    store,
    products: products.map((p) => p.ad_id),
    branches: branches.map((b) => ({ name: b.name, address: b.address ?? null })),
  };
}

/** Create and persist a snapshot (kind: 'auto' | 'manual'); keeps the latest 10 per store. */
export async function createSnapshot(userId: number, kind: 'auto' | 'manual'): Promise<StoreBackup | null> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return null;
  const snap = await buildSnapshot(userId, storeId);
  if (!snap) return null;
  await prisma.store_backups.create({ data: { store_id: storeId, kind, data: JSON.stringify(snap) } }).catch(() => {});
  const all = await prisma.store_backups.findMany({ where: { store_id: storeId }, orderBy: { id: 'desc' }, select: { id: true } }).catch(() => []);
  const extra = all.slice(10).map((r) => r.id);
  if (extra.length) await prisma.store_backups.deleteMany({ where: { id: { in: extra } } }).catch(() => {});
  return snap;
}

/** Periodic auto-backup — throttled to at most once per 24h (no scheduler; runs on dashboard load). */
export async function maybeAutoBackup(userId: number): Promise<void> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return;
  const last = await prisma.store_backups.findFirst({ where: { store_id: storeId, kind: 'auto' }, orderBy: { id: 'desc' }, select: { created_at: true } }).catch(() => null);
  if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000) return;
  await createSnapshot(userId, 'auto');
}

export async function listStoreBackups(storeId: number): Promise<BackupMeta[]> {
  await ensure();
  const rows = await prisma.store_backups.findMany({ where: { store_id: storeId }, orderBy: { id: 'desc' }, take: 10, select: { id: true, kind: true, created_at: true } }).catch(() => []);
  return rows.map((r) => ({ id: toInt(r.id), kind: r.kind, at: r.created_at ? new Date(r.created_at).toISOString() : null }));
}

/** Raw JSON of a backup (only if it belongs to this store) — for download. */
export async function getBackupJson(storeId: number, id: number): Promise<string | null> {
  await ensure();
  const r = await prisma.store_backups.findFirst({ where: { id: BigInt(id), store_id: storeId }, select: { data: true } }).catch(() => null);
  return r?.data ?? null;
}

/** Apply a parsed snapshot to the owner's store (overwrites settings + products + branches).
 *  Returns 'blocked' instead of restoring when the snapshot content fails the content
 *  guard — a manually-edited backup JSON is a real bypass vector around the normal
 *  save-path scan (save clean, then "restore" a doctored file with prohibited content
 *  straight onto the live public storefront). */
async function applySnapshot(userId: number, snap: StoreBackup): Promise<'ok' | 'blocked' | 'error'> {
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return 'error';
  const src = (snap.store || {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) if (f in src) data[f] = src[f];

  const textParts = [data.store_name, data.about, data.banner, data.tagline, data.announce, data.product_note, data.description, data.address, data.contacts, data.specialty, data.audience]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  const branches = Array.isArray(snap.branches) ? snap.branches.slice(0, 50) : [];
  const branchText = branches.map((b) => `${b?.name || ''} ${b?.address || ''}`).join(' ');
  const bad = await scanContent(textParts.join(' '), branchText);
  if (bad) {
    await handleProhibited(userId, bad.category, bad.term, `استعادة نسخة احتياطية للمتجر — محتوى ممنوع: ${textParts.join(' ')} ${branchText}`.slice(0, 300));
    return 'blocked';
  }

  await prisma.stores.updateMany({ where: { user_id: userId }, data }).catch(() => {});

  if (Array.isArray(snap.products)) {
    const ids = snap.products.filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
    const owned = ids.length
      ? await prisma.ads.findMany({ where: { user_id: BigInt(userId), id: { in: ids.map((n) => BigInt(n)) } }, select: { id: true } }).catch(() => [])
      : [];
    await prisma.store_products.deleteMany({ where: { store_id: storeId } }).catch(() => {});
    if (owned.length) await prisma.store_products.createMany({ data: owned.map((a) => ({ store_id: storeId, ad_id: toInt(a.id) })), skipDuplicates: true }).catch(() => {});
  }

  if (branches.length) {
    await prisma.store_branches.deleteMany({ where: { store_id: storeId } }).catch(() => {});
    for (const b of branches) {
      if (b && b.name) await prisma.store_branches.create({ data: { store_id: storeId, name: String(b.name).slice(0, 120), address: b.address ? String(b.address).slice(0, 200) : null } }).catch(() => {});
    }
  }
  return 'ok';
}

export async function restoreFromId(userId: number, id: number): Promise<'ok' | 'blocked' | 'error'> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return 'error';
  const json = await getBackupJson(storeId, id);
  if (!json) return 'error';
  try { return await applySnapshot(userId, JSON.parse(json) as StoreBackup); } catch { return 'error'; }
}

export async function restoreFromJson(userId: number, jsonText: string): Promise<'ok' | 'blocked' | 'error'> {
  await ensure();
  try {
    const snap = JSON.parse(jsonText) as StoreBackup;
    if (!snap || typeof snap !== 'object' || !snap.store) return 'error';
    return await applySnapshot(userId, snap);
  } catch { return 'error'; }
}
