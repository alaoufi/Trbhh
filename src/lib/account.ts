import 'server-only';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

/** الصور الأساسية دفعةً واحدة (استعلامان للكل) — كانت ٢ لكل إعلان (N+1)
 *  فتستهلك حوض الاتصالات وتبطّئ لوحة العضو والمتجر ومنتجات الرئيسية. */
async function primaryImages(adIds: bigint[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!adIds.length) return out;
  const photos = await prisma.photos.findMany({ where: { other_id: { in: adIds } }, orderBy: { id: 'asc' } }).catch(() => []);
  const firstByAd = new Map<number, string>();
  for (const p of photos) {
    const key = toInt(p.other_id);
    if (!firstByAd.has(key)) firstByAd.set(key, p.photo_path);
  }
  const upIds = [...new Set([...firstByAd.values()].map((v) => parseInt(v, 10) || 0).filter((n) => n > 0))];
  const ups = upIds.length ? await prisma.uploads.findMany({ where: { id: { in: upIds.map((n) => BigInt(n)) } } }).catch(() => []) : [];
  const fileById = new Map(ups.map((u) => [toInt(u.id), u.file_name]));
  for (const [adId, path] of firstByAd) {
    const f = fileById.get(parseInt(path, 10) || 0);
    out.set(adId, f ? mediaUrl(f) : PLACEHOLDER);
  }
  return out;
}

export async function getMyAds(userId: number) {
  const rows = await prisma.ads.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' } });
  const images = await primaryImages(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: toInt(r.id),
    title: r.title,
    price: r.price,
    adsType: r.adsType,
    status: r.status,
    state: r.state,
    storeOnly: r.store_only === 1,
    trbhhUntil: r.trbhh_until ? r.trbhh_until.toISOString() : null,
    urgentUntil: r.urgent_until ? r.urgent_until.toISOString() : null,
    bumpedAt: r.bumped_at ? r.bumped_at.toISOString() : null,
    publishAt: r.publish_at ? r.publish_at.toISOString() : null,
    pausedByOwner: r.paused_by_owner === 1,
    special: r.adsSpecial === 'checked',
    image: images.get(toInt(r.id)) ?? PLACEHOLDER,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    oldPrice: r.old_price ?? 0,
    stockState: r.stock_state ?? 0,
    // سبب إخفاء الإدارة للإعلان (مخالفة) — يظهر لصاحب الإعلان/المتجر
    hiddenReason: r.status !== 1 && r.arc_msg ? r.arc_msg : null,
    // مؤرشف (تلقائياً بعد المدة أو من الإدارة) — يعيده صاحبه للظهور برسوم
    archived: !!(r.data_archive && r.data_archive.trim() !== ''),
  }));
}

/** إعلانات بمعرّفاتها بنفس شكل getMyAds — لكتالوج المتجر (منتجات المالك وموظفيه معاً). */
export async function getAdsByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await prisma.ads.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, orderBy: { id: 'desc' } }).catch(() => []);
  const images = await primaryImages(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: toInt(r.id),
    title: r.title,
    price: r.price,
    adsType: r.adsType,
    status: r.status,
    special: r.adsSpecial === 'checked',
    image: images.get(toInt(r.id)) ?? PLACEHOLDER,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
    oldPrice: r.old_price ?? 0,
    stockState: r.stock_state ?? 0,
  }));
}

export async function getMyStats(userId: number) {
  const [ads, favorites, unread] = await Promise.all([
    prisma.ads.count({ where: { user_id: BigInt(userId) } }),
    prisma.favorites.count({ where: { user_id: BigInt(userId) } }),
    prisma.chats.count({ where: { reciver_id: userId, is_read: 0 } }),
  ]);
  return { ads, favorites, unread };
}

export async function getMyFavorites(userId: number) {
  const favs = await prisma.favorites.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' } });
  const adIds = favs.map((f) => f.ads_id);
  if (!adIds.length) return [];
  const ads = await prisma.ads.findMany({ where: { id: { in: adIds } } });
  const byId = new Map(ads.map((a) => [toInt(a.id), a]));
  const images = await primaryImages(ads.map((a) => a.id));
  const out = [];
  for (const f of favs) {
    const a = byId.get(toInt(f.ads_id));
    if (!a) continue;
    out.push({
      id: toInt(a.id),
      title: a.title,
      price: a.price,
      adsType: a.adsType,
      image: images.get(toInt(a.id)) ?? PLACEHOLDER,
      createdAt: a.created_at ? a.created_at.toISOString() : null,
    });
  }
  return out;
}

export async function isFavorited(userId: number, adId: number) {
  const f = await prisma.favorites.findFirst({ where: { user_id: BigInt(userId), ads_id: BigInt(adId) } });
  return !!f;
}

/** ضغطات التواصل (واتساب/اتصال) لكل إعلان — دفعة واحدة. */
export async function adContactCounts(adIds: number[]): Promise<Map<number, { whatsapp: number; call: number }>> {
  const out = new Map<number, { whatsapp: number; call: number }>();
  if (!adIds.length) return out;
  const rows = await prisma.ad_contacts.groupBy({
    by: ['ad_id', 'kind'],
    where: { ad_id: { in: adIds.map((i) => BigInt(i)) } },
    _count: { _all: true },
  }).catch(() => []);
  for (const r of rows) {
    const id = toInt(r.ad_id);
    const cur = out.get(id) || { whatsapp: 0, call: 0 };
    if (r.kind === 'whatsapp') cur.whatsapp = r._count._all;
    if (r.kind === 'call') cur.call = r._count._all;
    out.set(id, cur);
  }
  return out;
}
