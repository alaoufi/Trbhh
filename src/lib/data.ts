import 'server-only';
import { cache } from 'react';
import { prisma } from './prisma';
import { cached, cacheDel, cacheDelPattern } from './redis';
import { mediaUrl, PLACEHOLDER } from './media';
import { loadBanned, censorSync } from './censor';
import { sweepExpiredFeatured, getFeaturedTierMap, getUsersAdMeta } from './packages';
import { ensureSaudiAreas } from './seed-areas';
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
  urgent: boolean;
  views: number;
  sellerName: string | null;
  sellerTrusted: boolean;
  tier?: 'gold' | 'silver' | '';
  storeName?: string | null;
  storeId?: number | null;
  /** عروض اليوم: السعر قبل الخصم (يظهر مشطوباً مع نسبة الخصم إن كان أعلى من السعر) */
  oldPrice?: number;
};

async function sellerInfo(ids: bigint[]): Promise<Map<number, { name: string; trusted: boolean }>> {
  const uniq = [...new Set(ids.map(toInt))].filter(Boolean).map((n) => BigInt(n));
  if (!uniq.length) return new Map();
  const rows = await prisma.users.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, userName: true, trusted: true },
  });
  return new Map(rows.map((r) => [toInt(r.id), { name: r.name || r.userName || 'مستخدم', trusted: r.trusted === 1 }]));
}

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
  user_id: bigint;
  city_id: bigint;
  category_id: bigint;
  created_at: Date | null;
  urgent_until?: Date | null;
  old_price?: number;
};

async function toCards(rows: AdRow[]): Promise<AdCard[]> {
  const ids = rows.map((r) => r.id);
  const [images, views, cities, cats, sellers, adMeta] = await Promise.all([
    primaryImages(ids),
    viewCounts(ids),
    cityNames(rows.map((r) => r.city_id)),
    categoryNames(rows.map((r) => r.category_id)),
    sellerInfo(rows.map((r) => r.user_id)),
    getUsersAdMeta(rows.map((r) => toInt(r.user_id))).catch(() => new Map()),
  ]);
  await loadBanned();
  const now = Date.now();
  return rows
    .filter((r) => {
      // ad lifetime by the owner's package (0 => unlimited)
      const days = adMeta.get(toInt(r.user_id))?.adDays ?? 0;
      if (!days || !r.created_at) return true;
      return (now - r.created_at.getTime()) / 86400000 <= days;
    })
    .map((r) => {
      const s = sellers.get(toInt(r.user_id));
      return {
        id: toInt(r.id),
        title: censorSync(r.title),
        price: r.price,
        adsType: r.adsType,
        image: images.get(toInt(r.id)) ?? PLACEHOLDER,
        cityName: cities.get(toInt(r.city_id)) ?? null,
        categoryName: cats.get(toInt(r.category_id)) ?? null,
        createdAt: r.created_at ? r.created_at.toISOString() : null,
        special: r.adsSpecial === 'checked',
        urgent: !!(r.urgent_until && r.urgent_until.getTime() > now),
        views: views.get(toInt(r.id)) ?? 0,
        sellerName: s?.name ?? null,
        sellerTrusted: s?.trusted ?? false,
        tier: adMeta.get(toInt(r.user_id))?.tier ?? '',
        oldPrice: r.old_price && r.old_price > r.price ? r.old_price : 0,
      };
    });
}

// عزل المتاجر: إعلان المتجر لا يدخل قوائم تربح إلا بعرض مدفوع ساري المفعول (trbhh_until)
const activeAdWhere = () => ({
  status: 1,
  state: 'active' as const,
  AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }],
});

const adSelect = {
  id: true,
  title: true,
  price: true,
  adsType: true,
  adsSpecial: true,
  user_id: true,
  city_id: true,
  category_id: true,
  created_at: true,
  urgent_until: true,
  old_price: true,
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

/** Auto-delete ads that have been archived for more than 30 days. Throttled. */
let lastArchiveSweep = 0;
let lastExpirySweep = 0;

/** Remove the «مميّز» badge from ads whose paid featuring period ended (expires_at = featured-until).
 *  The ad stays published — only the featuring lapses. Cheap, throttled. */
export async function sweepExpiredPaidAds() {
  const now = Date.now();
  if (now - lastExpirySweep < 600_000) return; // at most once/10 min per container
  lastExpirySweep = now;
  await prisma.ads.updateMany({
    where: { adsSpecial: 'checked', expires_at: { not: null, lt: new Date() } },
    data: { adsSpecial: 'no', expires_at: null },
  }).catch(() => {});
}
export async function sweepExpiredArchived() {
  const now = Date.now();
  if (now - lastArchiveSweep < 3600_000) return; // at most once/hour
  lastArchiveSweep = now;
  const cutoff = now - 30 * 86400_000;
  const rows = await prisma.ads.findMany({
    where: { NOT: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true, data_archive: true },
  }).catch(() => [] as { id: bigint; data_archive: string | null }[]);
  const expired = rows.filter((r) => {
    const t = new Date(r.data_archive || '').getTime();
    return Number.isFinite(t) && t < cutoff;
  }).map((r) => r.id);
  if (expired.length) {
    await prisma.photos.deleteMany({ where: { other_id: { in: expired } } }).catch(() => {});
    await prisma.ads.deleteMany({ where: { id: { in: expired } } }).catch(() => {});
  }
}

/** Invalidate listing caches so a new/changed ad appears immediately
 *  everywhere (home, search, categories, and store showcases). */
export async function bustAdCaches(): Promise<void> {
  await Promise.all([
    cacheDelPattern('ads:*'),
    cacheDelPattern('stores:*'),
    cacheDel('stats:home'),
  ]);
}

export async function getLatestAds(take = 12) {
  return cached(`ads:latest:${take}`, 60, async () => {
    sweepExpiredArchived().catch(() => {});
    sweepExpiredPaidAds().catch(() => {});
    const rows = await prisma.ads.findMany({ where: activeAdWhere(), orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take, select: adSelect });
    return toCards(rows);
  });
}

export async function getFeaturedAds(take = 8) {
  return cached(`ads:featured:${take}`, 60, () => loadFeaturedAds(take));
}

/** عروض اليوم: إعلانات بسعر مخفّض (old_price أعلى من السعر) — إعلانات تربح، ومنتجات
 *  المتاجر المعتمدة لعرض إعلاناتها في المنصة فقط (لا يكسر عزل بقية المتاجر). */
export async function getDealAds(take = 60) {
  return cached(`ads:deals:${take}`, 60, async () => {
    const approvedStores = await prisma.stores.findMany({
      where: { status: 1, show_on_platform: 1 },
      select: { user_id: true },
    }).catch(() => []);
    const approvedUserIds = approvedStores.map((s) => BigInt(s.user_id));
    const rows = await prisma.ads.findMany({
      where: {
        status: 1,
        state: 'active',
        old_price: { gt: 0 },
        AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }, ...(approvedUserIds.length ? [{ user_id: { in: approvedUserIds } }] : [])] }],
      },
      orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: take * 2,
      select: adSelect,
    });
    const cards = await toCards(rows.filter((r) => (r.old_price ?? 0) > r.price && r.price > 0));
    return cards.slice(0, take);
  });
}

async function loadFeaturedAds(take: number) {
  await sweepExpiredFeatured().catch(() => {});
  const rows = await prisma.ads.findMany({
    where: { ...activeAdWhere(), adsSpecial: 'checked' },
    orderBy: { id: 'desc' },
    take: take * 3,
    select: adSelect,
  });
  // ذهبي أولاً ثم فضي ثم البقية (الأحدث ضمن كل فئة)
  const tiers = await getFeaturedTierMap(rows.map((r) => toInt(r.id))).catch(() => new Map());
  const rank = (id: number) => (tiers.get(id) === 'gold' ? 0 : tiers.get(id) === 'silver' ? 1 : 2);
  const ordered = [...rows].sort((a, b) => rank(toInt(a.id)) - rank(toInt(b.id)) || toInt(b.id) - toInt(a.id));
  return toCards(ordered.slice(0, take));
}

export async function getMostViewedAds(take = 8) {
  return cached(`ads:mostviewed:${take}`, 120, () => loadMostViewedAds(take));
}

async function loadMostViewedAds(take: number) {
  const groups = await prisma.ads_views.groupBy({
    by: ['ads_id'],
    _count: true,
    orderBy: { _count: { ads_id: 'desc' } },
    take: take * 3,
  });
  const ids = groups.map((g) => g.ads_id).filter(Boolean) as bigint[];
  if (!ids.length) return [];
  const rows = await prisma.ads.findMany({ where: { id: { in: ids }, ...activeAdWhere() }, select: adSelect });
  const cards = await toCards(rows);
  const order = new Map(ids.map((id, i) => [toInt(id), i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)).slice(0, take);
}

export async function getStats() {
  return cached('stats:home', 120, async () => {
    const [users, ads, cats, views] = await Promise.all([
      prisma.users.count(),
      prisma.ads.count({ where: activeAdWhere() }),
      prisma.categories.count({ where: { is_active: 'yes' } }),
      prisma.ads_views.count(),
    ]);
    return { users, ads, cats, views };
  });
}

export async function getCategory(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const cat = await prisma.categories.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!cat) return null;
  return { id: toInt(cat.id), name: cat.name };
}

export async function getAdsByCategory(categoryId: number, take = 24, skip = 0) {
  // مُخبّأ ٦٠ث (يُبطل عبر bustAdCaches بنمط ads:*) — حلقة «أقسام تهمّك» في
  // الرئيسية كانت تعيد بناء بطاقات حتى ٦ أقسام من القاعدة مع كل تنقّل.
  return cached(`ads:cat:${categoryId}:${take}:${skip}`, 60, async () => {
    const rows = await prisma.ads.findMany({
      where: { ...activeAdWhere(), category_id: BigInt(categoryId) },
      orderBy: [{ adsSpecial: 'desc' }, { bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take,
      skip,
      select: adSelect,
    });
    return toCards(rows);
  });
}

type SearchParamsT = {
  q?: string;
  categoryId?: number;
  countryId?: number;
  cityId?: number;
  type?: 'offer' | 'request';
  sort?: 'newest' | 'price_asc' | 'price_desc';
  special?: boolean;
  take?: number;
  skip?: number;
};

function buildSearchWhere({ q, categoryId, countryId, cityId, type, special }: SearchParamsT) {
  return {
    ...activeAdWhere(),
    ...(categoryId ? { category_id: BigInt(categoryId) } : {}),
    ...(countryId ? { country_id: countryId } : {}),
    ...(cityId ? { city_id: BigInt(cityId) } : {}),
    ...(type ? { adsType: type } : {}),
    ...(special ? { adsSpecial: 'checked' as const } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { detail: { contains: q } }] } : {}),
  };
}

/** إجمالي نتائج البحث — للترقيم المرقّم. */
export async function countSearchAds(params: SearchParamsT): Promise<number> {
  return prisma.ads.count({ where: buildSearchWhere(params) }).catch(() => 0);
}

export async function searchAds(params: SearchParamsT) {
  const { sort = 'newest', take = 48, skip = 0 } = params;
  const orderBy =
    sort === 'price_asc' ? [{ price: 'asc' as const }] :
    sort === 'price_desc' ? [{ price: 'desc' as const }] :
    [{ adsSpecial: 'desc' as const }, { bumped_at: { sort: 'desc' as const, nulls: 'last' as const } }, { id: 'desc' as const }];
  const rows = await prisma.ads.findMany({
    where: buildSearchWhere(params),
    skip: Math.max(0, skip),
    orderBy,
    take,
    select: adSelect,
  });
  return toCards(rows);
}

async function getAdImpl(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const ad = await prisma.ads.findFirst({ where: { id: BigInt(id) } }).catch(() => null);
  if (!ad) return null;

  const [city, area, category, seller, photos, views] = await Promise.all([
    prisma.cities.findUnique({ where: { id: ad.city_id }, select: { name: true } }),
    ad.area_id ? prisma.areas.findUnique({ where: { id: BigInt(ad.area_id) }, select: { name: true } }) : Promise.resolve(null),
    prisma.categories.findUnique({ where: { id: ad.category_id }, select: { id: true, name: true } }),
    prisma.users.findUnique({
      where: { id: ad.user_id },
      select: {
        id: true, name: true, userName: true, phoneNumber: true, phone_whatsapp: true,
        allow_phone: true, whatsapp: true, trusted: true, photo_path: true, created_at: true, ban: true,
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

  // video_path stores an uploads id ("0"/"" = none) — resolve to its file name
  const videoUploadId = parseInt(ad.video_path || '', 10) || 0;
  const videoFile = videoUploadId > 0
    ? (await prisma.uploads.findUnique({ where: { id: BigInt(videoUploadId) }, select: { file_name: true } }).catch(() => null))?.file_name || null
    : null;

  await loadBanned();
  return {
    id: toInt(ad.id),
    title: censorSync(ad.title),
    detail: censorSync(ad.detail),
    price: ad.price,
    adsType: ad.adsType,
    status: ad.status,
    state: ad.state,
    storeOnly: ad.store_only === 1,
    trbhhUntil: ad.trbhh_until ? ad.trbhh_until.toISOString() : null,
    urgentUntil: ad.urgent_until ? ad.urgent_until.toISOString() : null,
    oldPrice: ad.old_price ?? 0,
    stockState: ad.stock_state ?? 0,
    special: ad.adsSpecial === 'checked',
    createdAt: ad.created_at ? ad.created_at.toISOString() : null,
    lat: ad.lat,
    lng: ad.lng,
    videoPath: videoFile,
    phoneAllow: ad.phoneAllow === 1,
    commentAllow: ad.commentAllow === 1,
    images: images.length ? images : [PLACEHOLDER],
    views,
    city: city?.name ?? null,
    area: area?.name ?? null,
    category: category ? { id: toInt(category.id), name: category.name } : null,
    seller: seller
      ? {
          id: toInt(seller.id),
          name: seller.name || seller.userName || 'مستخدم',
          phone: seller.allow_phone ? seller.phoneNumber : null,
          whatsapp: seller.whatsapp ? seller.phone_whatsapp || seller.phoneNumber : null,
          trusted: seller.trusted === 1,
          banned: seller.ban === 'checked',
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
  const { REGION_ORDER } = await import('./seed-areas');
  const rows = await prisma.cities.findMany({ orderBy: { ordered: 'desc' } });
  // ترتيب المناطق الرسمي: الرياض ثم مكة ثم المدينة … — وغير المدرج يبقى بعدها بترتيبه القديم
  const rank = (name: string) => {
    const i = REGION_ORDER.indexOf(name.trim());
    return i === -1 ? REGION_ORDER.length : i;
  };
  return rows
    .map((c) => ({ id: toInt(c.id), name: c.name, countryId: c.country_id }))
    .sort((a, b) => rank(a.name) - rank(b.name));
}

/** Governorates / centers (المحافظات والمراكز) grouped under a region (city_id). */
export async function getAreas() {
  await ensureSaudiAreas().catch(() => {});
  const { SAUDI_AREAS } = await import('./seed-areas');
  const [rows, regions] = await Promise.all([
    prisma.areas.findMany(),
    prisma.cities.findMany({ select: { id: true, name: true } }),
  ]);
  const regionName = new Map(regions.map((r) => [toInt(r.id), r.name.trim()]));
  // ترتيب المدن داخل كل منطقة حسب القائمة الرسمية — وغير المدرج يأتي آخرها أبجدياً
  const rank = (a: { name: string; cityId: number }) => {
    const list = SAUDI_AREAS[regionName.get(a.cityId) ?? ''] || [];
    const i = list.indexOf(a.name.trim());
    return i === -1 ? 9_999 : i;
  };
  return rows
    .map((a) => ({ id: toInt(a.id), name: a.name, cityId: a.city_id }))
    .sort((a, b) => a.cityId - b.cityId || rank(a) - rank(b) || a.name.localeCompare(b.name, 'ar'));
}

export async function getAdForEdit(id: number, userId: number) {
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(id) } });
  if (!ad || toInt(ad.user_id) !== userId) return null;
  const owner = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { phoneNumber: true, phone_whatsapp: true } });
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
    areaId: ad.area_id ?? null,
    phoneAllow: ad.phoneAllow === 1,
    commentAllow: ad.commentAllow === 1,
    phone: owner?.phoneNumber ?? '',
    whatsapp: owner?.phone_whatsapp ?? '',
    lat: ad.lat ?? null,
    lng: ad.lng ?? null,
    oldPrice: ad.old_price ?? 0,
    stockState: ad.stock_state ?? 0,
  };
}

/** Record a unique view (deduped per viewer key). Safe to call on every render. */
export async function recordView(adId: number, viewerKey: string) {
  try {
    const existing = await prisma.ads_views.findFirst({ where: { ads_id: BigInt(adId), user_id: viewerKey } });
    if (!existing) {
      // stamp created_at so the seller analytics time-series has a real date
      const now = new Date();
      await prisma.ads_views.create({ data: { ads_id: BigInt(adId), user_id: viewerKey, created_at: now, updated_at: now } });
    }
  } catch {
    /* views are best-effort */
  }
}

/** Similar ads from the same category (excluding the current ad). */
export async function getSimilarAds(adId: number, categoryId: number, take = 6) {
  const rows = await prisma.ads.findMany({
    where: { ...activeAdWhere(), category_id: BigInt(categoryId), id: { not: BigInt(adId) } },
    orderBy: [{ adsSpecial: 'desc' }, { id: 'desc' }],
    take,
    select: adSelect,
  });
  return toCards(rows);
}

/* memoized per-request (React cache): tames repeated hot reads within one navigation */
export const getAd = cache(getAdImpl);

/* ناشر الجدولة الكسول: يرقّي الإعلانات المجدولة التي حان موعدها — يعمل مع التصفح بخنق ٦٠ث. */
let schedLastRun = 0;
export async function promoteScheduledAds(): Promise<void> {
  const now = Date.now();
  if (now - schedLastRun < 60_000) return;
  schedLastRun = now;
  try {
    const r = await prisma.ads.updateMany({
      where: { status: 0, publish_at: { not: null, lte: new Date() } },
      data: { status: 1, publish_at: null },
    });
    if (r.count > 0) await bustAdCaches().catch(() => {});
  } catch { /* لا يعطّل الصفحة */ }
}
