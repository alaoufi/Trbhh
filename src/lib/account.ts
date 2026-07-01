import 'server-only';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

async function primaryImage(adId: bigint): Promise<string> {
  const ph = await prisma.photos.findFirst({ where: { other_id: adId }, orderBy: { id: 'asc' } });
  if (!ph) return PLACEHOLDER;
  const up = await prisma.uploads.findUnique({ where: { id: BigInt(parseInt(ph.photo_path, 10) || 0) } });
  return up?.file_name ? mediaUrl(up.file_name) : PLACEHOLDER;
}

export async function getMyAds(userId: number) {
  const rows = await prisma.ads.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' } });
  return Promise.all(
    rows.map(async (r) => ({
      id: toInt(r.id),
      title: r.title,
      price: r.price,
      adsType: r.adsType,
      status: r.status,
      state: r.state,
      special: r.adsSpecial === 'checked',
      image: await primaryImage(r.id),
      createdAt: r.created_at ? r.created_at.toISOString() : null,
    })),
  );
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
  const out = [];
  for (const f of favs) {
    const a = byId.get(toInt(f.ads_id));
    if (!a) continue;
    out.push({
      id: toInt(a.id),
      title: a.title,
      price: a.price,
      adsType: a.adsType,
      image: await primaryImage(a.id),
      createdAt: a.created_at ? a.created_at.toISOString() : null,
    });
  }
  return out;
}

export async function isFavorited(userId: number, adId: number) {
  const f = await prisma.favorites.findFirst({ where: { user_id: BigInt(userId), ads_id: BigInt(adId) } });
  return !!f;
}
