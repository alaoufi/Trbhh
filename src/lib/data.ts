import 'server-only';
import { prisma } from './prisma';
import { cached } from './redis';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

export type AdCard = {
  id: number;
  title: string;
  price: number;
  adsType: string;
  image: string;
  cityName: string | null;
  categoryName: string | null;
  createdAt: string | null;
  special: boolean;
  views: number;
};

// ---- batched manual joins (the legacy DB has no foreign keys) ----

async function cityNames(ids: bigint[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.map(toInt))].filter(Boolean).map((n) => BigInt(n));
  if (!uniq.length) return new Map();
  const rows = await prisma.cities.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [toInt(r.id), r.name]));
}

async function categoryNames(ids: bigint[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.map(toInt))].filter(Boolean).map((n) => BigInt(n));
  if (!uniq.length) return new Map();
  const rows = await prisma.categories.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [toInt(r.id), r.name]));
}

async function viewCounts(ids: bigint[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const groups = await prisma.ads_views.groupBy({ by: ['ads_id'], where: { ads_id: { in: ids } }, _count: true });
  return new Map(groups.map((g) => [toInt(g.ads_id), g._count]));
}

/**
 * Resolve the primary image for a set of ads via the
 * ad → photos(other_id) → photo_path(=upload id) → uploads.file_name chain.
 */
async function primaryImages(adIds: bigint[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!adIds.length) return out;
  const photos = await prisma.photos.findMany({ where: { other_id: { in: adIds } }, orderBy: { id: 'asc' } });
  const firstUploadIdByAd = new Map<number, bigint>();
  for (const ph of photos) {
    const adId = toInt(ph.other_id);
    if (!firstUploadIdByAd.has(adId)) {
      const uploadId = BigInt(parseInt(ph.photo_path, 10) || 0);
      if (uploadId > 0n) firstUploadIdByAd.set(adId, uploadId);
    }
  }
  const uploadIds = [...firstUploadIdByAd.values()];
  if (!uploadIds.length) return out;
  const uploads = await prisma.uploads.findMany({ where: { id: { in: uploadIds } } });
  const fileById = new Map(uploads.map((u) => [toInt(u.id), u.file_name]));
  for (const [adId, uploadId] of firstUploadIdByAd) {
    const file = fileById.get(toInt(uploadId));
    out.set(adId, file ? mediaUrl(file) : PLACEHOLDER);
  }
  return out;
}

type AdRow = {
  id: bigint;
  title: string;
  price: number;
  adsType: string;
  adsSpecial: string;
  city_id: bigint;
  category_id: bigint;
  created_at: Date | null;
};

async function toCards(rows: AdRow[]): Promise<AdCard[]> {
  const ids = rows.map((r) => r.id);
  const [images, views, cities, cats] = await Promise.all([
    primaryImages(ids),
    viewCounts(ids),
    cityNames(rows.map((r) => r.city_id)),
    categoryNames(rows.map((r) => r.category_id)),
  ]);
  return rows.map((r) => ({
    id: toInt(r.id),
    title: r.title,
    price: r.price,
    adsType: r.adsType,
    image: images.get(toInt(r.id)) ?? PLACEHOLDER,
    cityName: cities.get(toInt(r.city_id)) ?? null,
    categoryName: cats.get(toInt(r.category_id)) ?? null,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
    special: r.adsSpecial === 'checked',
    views: views.get(toInt(r.id)) ?? 0,
  }));
}

const activeAdWhere = { status: 1, state: 'active' as const };

const adSelect = {
  id: true,
  title: true,
  price: true,
  adsType: true,
  adsSpecial: true,
  city_id: true,
  category_id: true,
  created_at: true,
} as const;

export async function getCategories() {
  return cached('categories:active', 300, async () => {
    const cats = await prisma.categories.findMany({ where: { is_active: 'yes' }, orderBy: { ordered: 'desc' } });
    const uploadIds = cats.map((c) => BigInt(parseInt(c.photo_path, 10) || 0)).filter((n) => n > 0n);
    const uploads = uploadIds.length ? await prisma.uploads.findMany({ where: { id: { in: uploadIds } } }) : [];
    const fileById = new Map(uploads.map((u) => [toInt(u.id), u.file_name]));
    return cats.map((c) => ({
      id: toInt(c.id),
      name: c.name,
      icon: mediaUrl(fileById.get(parseInt(c.photo_path, 10)) ?? null),
    }));
  });
}

export async function getLatestAds(take = 12) {
  const rows = await prisma.ads.findMany({ where: activeAdWhere, orderBy: { id: 'desc' }, take, select: adSelect });
  return toCards(rows);
}

export async function getFeaturedAds(take = 8) {
  const rows = await prisma.ads.findMany({
    where: { ...activeAdWhere, adsSpecial: 'checked' },
    orderBy: { id: 'desc' },
    take,
    select: adSelect,
  });
  return toCards(rows);
}

export async function getMostViewedAds(take = 8) {
  const groups = await prisma.ads_views.groupBy({
    by: ['ads_id'],
    _count: true,
    orderBy: { _count: { ads_id: 'desc' } },
    take: take * 3,
  });
  const ids = groups.map((g) => g.ads_id).filter(Boolean) as bigint[];
  if (!ids.length) return [];
  const rows = await prisma.ads.findMany({ where: { id: { in: ids }, ...activeAdWhere }, select: adSelect });
  const cards = await toCards(rows);
  const order = new Map(ids.map((id, i) => [toInt(id), i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)).slice(0, take);
}

export async function getStats() {
  return cached('stats:home', 120, async () => {
    const [users, ads, cats, views] = await Promise.all([
      prisma.users.count(),
      prisma.ads.count({ where: activeAdWhere }),
      prisma.categories.count({ where: { is_active: 'yes' } }),
      prisma.ads_views.count(),
    ]);
    return { users, ads, cats, views };
  });
}

export async function getCategory(id: number) {
  const cat = await prisma.categories.findUnique({ where: { id: BigInt(id) } });
  if (!cat) return null;
  return { id: toInt(cat.id), name: cat.name };
}

export async function getAdsByCategory(categoryId: number, take = 24, skip = 0) {
  const rows = await prisma.ads.findMany({
    where: { ...activeAdWhere, category_id: BigInt(categoryId) },
    orderBy: [{ adsSpecial: 'desc' }, { id: 'desc' }],
    take,
    skip,
    select: adSelect,
  });
  return toCards(rows);
}

export async function searchAds(params: {
  q?: string;
  categoryId?: number;
  countryId?: number;
  cityId?: number;
  type?: 'offer' | 'request';
  take?: number;
}) {
  const { q, categoryId, countryId, cityId, type, take = 30 } = params;
  const rows = await prisma.ads.findMany({
    where: {
      ...activeAdWhere,
      ...(categoryId ? { category_id: BigInt(categoryId) } : {}),
      ...(countryId ? { country_id: countryId } : {}),
      ...(cityId ? { city_id: BigInt(cityId) } : {}),
      ...(type ? { adsType: type } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { detail: { contains: q } }] } : {}),
    },
    orderBy: [{ adsSpecial: 'desc' }, { id: 'desc' }],
    take,
    select: adSelect,
  });
  return toCards(rows);
}

export async function getAd(id: number) {
  const ad = await prisma.ads.findFirst({ where: { id: BigInt(id) } });
  if (!ad) return null;

  const [city, category, seller, photos, views] = await Promise.all([
    prisma.cities.findUnique({ where: { id: ad.city_id }, select: { name: true } }),
    prisma.categories.findUnique({ where: { id: ad.category_id }, select: { id: true, name: true } }),
    prisma.users.findUnique({
      where: { id: ad.user_id },
      select: {
        id: true, name: true, userName: true, phoneNumber: true, phone_whatsapp: true,
        allow_phone: true, whatsapp: true, trusted: true, photo_path: true, created_at: true,
      },
    }),
    prisma.photos.findMany({ where: { other_id: ad.id }, orderBy: { id: 'asc' } }),
    prisma.ads_views.count({ where: { ads_id: ad.id } }),
  ]);

  const uploadIds = photos.map((p) => BigInt(parseInt(p.photo_path, 10) || 0)).filter((n) => n > 0n);
  const uploads = uploadIds.length ? await prisma.uploads.findMany({ where: { id: { in: uploadIds } } }) : [];
  const fileById = new Map(uploads.map((u) => [toInt(u.id), u.file_name]));
  const images = photos
    .map((p) => fileById.get(parseInt(p.photo_path, 10)))
    .filter(Boolean)
    .map((f) => mediaUrl(f as string));

  return {
    id: toInt(ad.id),
    title: ad.title,
    detail: ad.detail,
    price: ad.price,
    adsType: ad.adsType,
    special: ad.adsSpecial === 'checked',
    createdAt: ad.created_at ? ad.created_at.toISOString() : null,
    lat: ad.lat,
    lng: ad.lng,
    videoPath: ad.video_path || null,
    phoneAllow: ad.phoneAllow === 1,
    commentAllow: ad.commentAllow === 1,
    images: images.length ? images : [PLACEHOLDER],
    views,
    city: city?.name ?? null,
    category: category ? { id: toInt(category.id), name: category.name } : null,
    seller: seller
      ? {
          id: toInt(seller.id),
          name: seller.name || seller.userName || 'مستخدم',
          phone: seller.allow_phone ? seller.phoneNumber : null,
          whatsapp: seller.whatsapp ? seller.phone_whatsapp || seller.phoneNumber : null,
          trusted: seller.trusted === 1,
          avatar: seller.photo_path ? mediaUrl(seller.photo_path) : null,
          memberSince: seller.created_at ? seller.created_at.toISOString() : null,
        }
      : null,
  };
}

export async function getCountries() {
  return cached('countries:active', 600, async () => {
    const rows = await prisma.countries.findMany({ where: { is_active: 1 }, orderBy: { ordered: 'desc' } });
    return rows.map((c) => ({ id: toInt(c.id), name: c.name }));
  });
}

export async function getSubCategories() {
  const rows = await prisma.sub_categories.findMany({ where: { active: 1 }, orderBy: { order: 'desc' } });
  return rows.map((s) => ({ id: toInt(s.id), name: s.name, categoryId: s.category_id }));
}

export async function getCities() {
  const rows = await prisma.cities.findMany({ orderBy: { ordered: 'desc' } });
  return rows.map((c) => ({ id: toInt(c.id), name: c.name, countryId: c.country_id }));
}

export async function getAdForEdit(id: number, userId: number) {
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(id) } });
  if (!ad || toInt(ad.user_id) !== userId) return null;
  return {
    id: toInt(ad.id),
    title: ad.title,
    detail: ad.detail,
    price: ad.price,
    adsType: ad.adsType as string,
    categoryId: toInt(ad.category_id),
    subcategoryId: ad.subcategory_id ?? null,
    countryId: ad.country_id ?? null,
    cityId: toInt(ad.city_id),
    phoneAllow: ad.phoneAllow === 1,
    commentAllow: ad.commentAllow === 1,
  };
}
