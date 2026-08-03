import 'server-only';
import { cache } from 'react';
import { prisma } from './prisma';
import { cached, cacheDel, cacheDelPattern } from './redis';
import { mediaUrl, PLACEHOLDER } from './media';
import { loadBanned, censorSync } from './censor';
import { sweepExpiredFeatured, getFeaturedTierMap, getUsersAdMeta } from './packages';
import { ensureSaudiAreas } from './seed-areas';
import { getProfileDisplay } from './profiles';
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
  /** تقييم الإعلان (تجارب العملاء) — متوسط النجوم وعددها؛ يظهر كدليل اجتماعي على البطاقة */
  ratingAvg?: number;
  ratingCount?: number;
  /** مواصفات عقارية للبطاقة بأسلوب عقار (النوع/الغرض/غرف/حمامات/مساحة) */
  reType?: string | null;
  purpose?: 'rent' | 'sale' | 'som' | null;
  reBeds?: number | null;
  reBaths?: number | null;
  reArea?: number | null;
};

async function sellerInfo(ids: bigint[]): Promise<Map<number, { name: string; trusted: boolean; banned: boolean }>> {
  const uniq = [...new Set(ids.map(toInt))].filter(Boolean).map((n) => BigInt(n));
  if (!uniq.length) return new Map();
  const rows = await prisma.users.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, userName: true, trusted: true, ban: true },
  });
  return new Map(rows.map((r) => [toInt(r.id), { name: r.name || r.userName || 'مستخدم', trusted: r.trusted === 1, banned: r.ban === 'checked' }]));
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
  bumped_at?: Date | null;
  urgent_until?: Date | null;
  old_price?: number;
  expires_at?: Date | null;
  re_type?: string | null;
  price_type?: string | null;
  re_beds?: number | null;
  re_baths?: number | null;
  re_area?: number | null;
};

async function toCards(rows: AdRow[]): Promise<AdCard[]> {
  const ids = rows.map((r) => r.id);
  const { getAdRatingsBrief } = await import('./ad-reviews');
  const [images, views, cities, cats, sellers, adMeta, ratings] = await Promise.all([
    primaryImages(ids),
    viewCounts(ids),
    cityNames(rows.map((r) => r.city_id)),
    categoryNames(rows.map((r) => r.category_id)),
    sellerInfo(rows.map((r) => r.user_id)),
    getUsersAdMeta(rows.map((r) => toInt(r.user_id))).catch(() => new Map()),
    getAdRatingsBrief(rows.map((r) => toInt(r.id))).catch(() => new Map()),
  ]);
  await loadBanned();
  const now = Date.now();
  return rows
    .filter((r) => {
      // إعلانات الأعضاء المحظورين لا تظهر للزوّار في أي قائمة
      if (sellers.get(toInt(r.user_id))?.banned) return false;
      // مميّز أو عاجل ساري الدفع يُستثنى تماماً من سقف «مدة بقاء الإعلان» —
      // العضو دفع مقابل الظهور، فلا يُخفى إعلانه لمجرد تجاوز أيام باقته العادية.
      const featuredActive = r.adsSpecial === 'checked' && !!r.expires_at && r.expires_at.getTime() > now;
      const urgentActive = !!(r.urgent_until && r.urgent_until.getTime() > now);
      if (featuredActive || urgentActive) return true;
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
        // الوقت الظاهر على البطاقة = آخر نشاط (التحديث ⬆ إن كان أحدث من النشر) ليطابق الترتيب
        createdAt: (r.bumped_at && r.created_at && r.bumped_at > r.created_at ? r.bumped_at : r.created_at)?.toISOString() ?? null,
        special: r.adsSpecial === 'checked',
        urgent: !!(r.urgent_until && r.urgent_until.getTime() > now),
        views: views.get(toInt(r.id)) ?? 0,
        sellerName: s?.name ?? null,
        sellerTrusted: s?.trusted ?? false,
        tier: adMeta.get(toInt(r.user_id))?.tier ?? '',
        oldPrice: r.old_price && r.old_price > r.price ? r.old_price : 0,
        ratingAvg: ratings.get(toInt(r.id))?.avg ?? 0,
        ratingCount: ratings.get(toInt(r.id))?.count ?? 0,
        reType: r.re_type ?? null,
        purpose: (r.price_type ?? null) as 'rent' | 'sale' | 'som' | null,
        reBeds: r.re_beds ?? null,
        reBaths: r.re_baths ?? null,
        reArea: r.re_area ?? null,
      };
    });
}

// منصّة عقارية مستقلّة (beta): تُعرض الإعلانات العقارية فقط في كل القوائم (فلتر واحد على
// is_realestate=1 يغطّي جميع القوائم التي تمرّ من هنا). عزل المتاجر كما هو (trbhh_until).
async function activeAdWhere() {
  return {
    status: 1,
    state: 'active' as const,
    is_realestate: 1,
    AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }],
  };
}

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
  bumped_at: true,
  urgent_until: true,
  old_price: true,
  expires_at: true,
  re_type: true,
  price_type: true,
  re_beds: true,
  re_baths: true,
  re_area: true,
} as const;

/** القسم الاحتياطي «عروض أخرى»: يُسنَد لكل إعلان جديد داخلياً (تصنيف آلي بحت
 *  للتوافق مع عمود category_id في القاعدة) — ميزة الأقسام نفسها مُزالة نهائياً
 *  من التطبيق، هذا الإسناد غير ظاهر لأحد. */
export async function getFallbackCategoryId(): Promise<number> {
  const existing = await prisma.categories.findFirst({ where: { name: 'عروض أخرى' }, select: { id: true } }).catch(() => null);
  if (existing) return toInt(existing.id);
  const created = await prisma.categories.create({ data: { name: 'عروض أخرى', photo_path: '', is_active: 'yes', ordered: 999 } }).catch(() => null);
  return created ? toInt(created.id) : 0;
}

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
let lastLifetimeSweep = 0;

/** أرشفة تلقائية: إعلانات (غير المتجر) مضى على آخر نشاطها أكثر من المدة المحددة
 *  في الإعدادات تُؤرشف (تختفي عن العامة، تبقى لصاحبها الذي يعيدها للظهور برسوم).
 *  0 = معطّل. لا تحذف شيئاً — أرشفة فقط. مُخنَّقة مرة/ساعة لكل حاوية. */
export async function sweepOldAdsToArchive() {
  const now = Date.now();
  if (now - lastLifetimeSweep < 3600_000) return;
  lastLifetimeSweep = now;
  const days = await import('./settings').then((m) => m.getAdLifetimeDays()).catch(() => 0);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = new Date(now - days * 86400_000);
  // آخر نشاط = الأحدث بين bumped_at و created_at؛ نؤرشف حين يكون كلاهما أقدم من الحد
  await prisma.ads.updateMany({
    where: {
      status: 1, state: 'active', store_only: 0,
      OR: [{ data_archive: null }, { data_archive: '' }],
      AND: [
        { OR: [{ bumped_at: { lt: cutoff } }, { bumped_at: null }] },
        { OR: [{ created_at: { lt: cutoff } }, { created_at: null }] },
      ],
    },
    data: { status: 0, data_archive: new Date().toISOString() },
  }).catch(() => {});
}

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
  // الحذف التلقائي للمؤرشف مُعطَّل افتراضياً (الحذف يدوي) — يحمي الإعلانات
  // المستوردة القديمة من الحذف. يُفعّله المشرف صراحةً عند الحاجة من الإعدادات.
  const on = await import('./settings').then((m) => m.getSettingBool('archive_autodelete_on', false)).catch(() => false);
  if (!on) return;
  // مدة الأرشفة قبل الحذف: ٦ أشهر (١٨٠ يوماً) — لا يُحذف إلا ما بقي مؤرشفاً أطول من ذلك.
  const cutoffOld = now - 180 * 86400_000;
  const rows = await prisma.ads.findMany({
    where: { NOT: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true, data_archive: true },
  }).catch(() => [] as { id: bigint; data_archive: string | null }[]);
  const expired = rows.filter((r) => {
    const t = new Date(r.data_archive || '').getTime();
    return Number.isFinite(t) && t < cutoffOld;
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

/** «آخر نشاط» للإعلان: التحديث (Bump) أو النشر — مفتاح الترتيب والوقت الظاهر معاً. */
const activityMs = (r: { bumped_at?: Date | null; created_at: Date | null }) =>
  Math.max(r.bumped_at?.getTime() ?? 0, r.created_at?.getTime() ?? 0);

export async function getLatestAds(take = 12) {
  return cached(`ads:latest:${take}`, 60, async () => {
    sweepExpiredArchived().catch(() => {});
    sweepExpiredPaidAds().catch(() => {});
    sweepOldAdsToArchive().catch(() => {});
    // نجلب أكثر ثم نرتب بآخر نشاط فعلياً (القديم المستورد بلا bumped_at يرتَّب بتاريخ نشره)
    const rows = await prisma.ads.findMany({ where: await activeAdWhere(), orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take: take * 3, select: adSelect });
    rows.sort((a, b) => activityMs(b) - activityMs(a));
    return toCards(rows.slice(0, take));
  });
}

/** أحدث الإعلانات للرئيسية: كل إعلانات آخر ٣٠ يوماً — الأقدم يبقى في البحث والأقسام.
 *  عند خلوّ الشهر من إعلانات نعرض أحدث ١٢ حتى لا تبدو الرئيسية فارغة. */
export async function getHomeLatestAds() {
  return cached('ads:home-latest:30d', 60, async () => {
    sweepExpiredArchived().catch(() => {});
    sweepExpiredPaidAds().catch(() => {});
    sweepOldAdsToArchive().catch(() => {});
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await prisma.ads.findMany({
      where: { ...(await activeAdWhere()), created_at: { gte: since } },
      orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: 400,
      select: adSelect,
    });
    // الترتيب الحقيقي بآخر نشاط (نشر أو تحديث ⬆) — يطابق الوقت الظاهر على البطاقة
    rows.sort((a, b) => activityMs(b) - activityMs(a));
    if (rows.length > 0) return toCards(rows);
    const fallback = await prisma.ads.findMany({ where: await activeAdWhere(), orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take: 12, select: adSelect });
    return toCards(fallback);
  });
}

/** سوق الطلبات العكسي: إعلانات «طلب» النشطة (يبحث العملاء عنها) — يقدّم البائعون عروضهم. */
export async function getRequestAds(take = 48) {
  const rows = await prisma.ads.findMany({
    where: { ...(await activeAdWhere()), adsType: 'request' },
    orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take,
    select: adSelect,
  });
  return toCards(rows);
}

/** جلب إعلانات محدّدة بمعرّفاتها بشكل بطاقة (للمقارنة) — يحافظ على ترتيب المعرّفات. */
export async function getAdsByIdsCards(ids: number[]) {
  const clean = [...new Set(ids.filter((n) => n > 0))].slice(0, 4);
  if (!clean.length) return [];
  const rows = await prisma.ads.findMany({ where: { id: { in: clean.map((n) => BigInt(n)) } }, select: adSelect });
  const cards = await toCards(rows);
  const order = new Map(clean.map((id, i) => [id, i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

/** إعلانات نفس المعلن (ذات صلة): بقية إعلاناته النشطة في تربح عدا الإعلان المفتوح. */
export async function getSellerAds(sellerId: number, excludeAdId: number, take = 6) {
  const rows = await prisma.ads.findMany({
    where: { ...(await activeAdWhere()), user_id: BigInt(sellerId), id: { not: BigInt(excludeAdId) } },
    orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take,
    select: adSelect,
  });
  return toCards(rows);
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
        is_realestate: 1, // منصّة عقارية: عقار فقط
      },
      orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: take * 2,
      select: adSelect,
    });
    const cards = await toCards(rows.filter((r) => (r.old_price ?? 0) > r.price && r.price > 0));
    return cards.slice(0, take);
  });
}

export type RealEstateFilters = {
  type?: string;                 // نوع العقار (re_type)
  purpose?: 'rent' | 'sale';     // الغرض (price_type)
  cityId?: number;               // المدينة
  priceMin?: number; priceMax?: number;
  areaMin?: number; areaMax?: number;
  beds?: number;                 // أقل عدد غرف
};

/** يبني شرط تصفية العقار المشترك (للخريطة والقوائم) من الفلاتر. */
export function realEstateFilterWhere(f: RealEstateFilters) {
  const priceRange = (f.priceMin || f.priceMax)
    ? { price: { ...(f.priceMin ? { gte: f.priceMin } : {}), ...(f.priceMax ? { lte: f.priceMax } : {}) } }
    : {};
  const areaRange = (f.areaMin || f.areaMax)
    ? { re_area: { ...(f.areaMin ? { gte: f.areaMin } : {}), ...(f.areaMax ? { lte: f.areaMax } : {}) } }
    : {};
  return {
    ...(f.type ? { re_type: f.type } : {}),
    ...(f.purpose ? { price_type: f.purpose } : {}),
    ...(f.cityId ? { city_id: BigInt(f.cityId) } : {}),
    ...(f.beds ? { re_beds: { gte: f.beds } } : {}),
    ...priceRange,
    ...areaRange,
  };
}

/**
 * عقارات لها موقع (lat/lng) — لخريطة التصفّح (المنصّة العقارية). ترجع نقاطاً خفيفة فقط.
 */
export async function getMapAds(filters: RealEstateFilters = {}, take = 500) {
  return cached(`ads:map:${take}:${JSON.stringify(filters)}`, 60, async () => {
    const rows = await prisma.ads.findMany({
      where: {
        ...(await activeAdWhere()),
        lat: { not: null },
        lng: { not: null },
        ...realEstateFilterWhere(filters),
      },
      orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take,
      select: { id: true, title: true, price: true, lat: true, lng: true, re_type: true, price_type: true },
    });
    const pts = [];
    for (const r of rows) {
      const lat = parseFloat(String(r.lat));
      const lng = parseFloat(String(r.lng));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      pts.push({
        id: toInt(r.id),
        title: r.title ?? '',
        price: r.price ?? 0,
        lat,
        lng,
        type: r.re_type ?? null,
        purpose: (r.price_type ?? null) as 'rent' | 'sale' | 'som' | null,
      });
    }
    return pts;
  });
}

async function loadFeaturedAds(take: number) {
  await sweepExpiredFeatured().catch(() => {});
  const rows = await prisma.ads.findMany({
    where: { ...(await activeAdWhere()), adsSpecial: 'checked' },
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

/** الأعلى تقييماً: إعلانات نالت أعلى متوسط نجوم (بعيّنة كافية ≥3) — يبرزها للزبائن في الرئيسية. */
export async function getTopRatedAds(take = 8) {
  return cached(`ads:toprated:${take}`, 180, async () => {
    const groups = await prisma.review_ads.groupBy({
      by: ['ads_id'], _avg: { star: true }, _count: { _all: true },
      orderBy: { _avg: { star: 'desc' } }, take: 80,
    }).catch(() => [] as { ads_id: bigint; _avg: { star: number | null }; _count: { _all: number } }[]);
    const top = groups.filter((g) => (g._count._all || 0) >= 3 && (g._avg.star || 0) >= 4).slice(0, take * 2);
    const ids = top.map((g) => g.ads_id);
    if (!ids.length) return [];
    const rows = await prisma.ads.findMany({ where: { id: { in: ids }, ...(await activeAdWhere()) }, select: adSelect });
    const cards = await toCards(rows);
    const order = new Map(top.map((g, i) => [toInt(g.ads_id), i]));
    return cards.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)).slice(0, take);
  });
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
  const rows = await prisma.ads.findMany({ where: { id: { in: ids }, ...(await activeAdWhere()) }, select: adSelect });
  const cards = await toCards(rows);
  const order = new Map(ids.map((id, i) => [toInt(id), i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)).slice(0, take);
}

export async function getStats() {
  return cached('stats:home', 120, async () => {
    const [users, ads, cats, views] = await Promise.all([
      prisma.users.count(),
      prisma.ads.count({ where: await activeAdWhere() }),
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
      where: { ...(await activeAdWhere()), category_id: BigInt(categoryId) },
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
  areaId?: number;
  type?: 'offer' | 'request';
  sort?: 'newest' | 'price_asc' | 'price_desc';
  special?: boolean;
  take?: number;
  skip?: number;
  // فلاتر عقارية
  reType?: string;
  purpose?: 'rent' | 'sale';
  priceMin?: number; priceMax?: number;
  areaMin?: number; areaMax?: number;
  beds?: number;
};

async function buildSearchWhere({ q, categoryId, countryId, cityId, areaId, type, special, reType, purpose, priceMin, priceMax, areaMin, areaMax, beds }: SearchParamsT) {
  // بحث ذكي: تُقسَّم العبارة كلمات، وكل كلمة تُطابق العنوان أو التفاصيل بأي ترتيب،
  // مع توحيد أشكال الألف (أ إ آ ← ا) والتاء المربوطة (ة/ه) والياء (ى/ي)
  const norm = (w: string) => w.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  const tokens = (q || '').trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  if (!tokens.length && (q || '').trim()) tokens.push((q as string).trim());
  const textClauses = tokens.map((t) => {
    const variants = Array.from(new Set([t, norm(t), t.replace(/ه$/, 'ة'), t.replace(/ة$/, 'ه'), t.replace(/ي$/, 'ى'), t.replace(/ى$/, 'ي')]));
    return { OR: variants.flatMap((v) => [{ title: { contains: v } }, { detail: { contains: v } }]) };
  });
  return {
    status: 1,
    state: 'active' as const,
    AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }, ...textClauses],
    ...(categoryId ? { category_id: BigInt(categoryId) } : {}),
    ...(countryId ? { country_id: countryId } : {}),
    ...(cityId ? { city_id: BigInt(cityId) } : {}),
    ...(areaId ? { area_id: areaId } : {}),
    ...(type ? { adsType: type } : {}),
    ...(special ? { adsSpecial: 'checked' as const } : {}),
    ...realEstateFilterWhere({ type: reType, purpose, priceMin, priceMax, areaMin, areaMax, beds }),
    is_realestate: 1, // منصّة عقارية: البحث في العقار فقط
  };
}

/** إجمالي نتائج البحث — للترقيم المرقّم. */
export async function countSearchAds(params: SearchParamsT): Promise<number> {
  return prisma.ads.count({ where: await buildSearchWhere(params) }).catch(() => 0);
}

export async function searchAds(params: SearchParamsT) {
  const { sort = 'newest', take = 48, skip = 0 } = params;
  const orderBy =
    sort === 'price_asc' ? [{ price: 'asc' as const }] :
    sort === 'price_desc' ? [{ price: 'desc' as const }] :
    [{ adsSpecial: 'desc' as const }, { bumped_at: { sort: 'desc' as const, nulls: 'last' as const } }, { id: 'desc' as const }];
  const rows = await prisma.ads.findMany({
    where: await buildSearchWhere(params),
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
  // منصّة عقارية: لا يُفتح إلا إعلان عقاري (غير العقاري لا يخصّ هذه المنصّة)
  if (ad.is_realestate !== 1) return null;

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

  // video_path holds either a modern storage path ("uploads/video_<hash>.mp4",
  // written directly by createAdAction/updateAdAction) or — for legacy
  // imported ads only — a numeric uploads-table id that must be resolved to
  // its file name. A pure-digit string is always the legacy id shape (modern
  // paths always start with "uploads/").
  const videoPathRaw = ad.video_path || '';
  const videoFile = /^\d+$/.test(videoPathRaw)
    ? (parseInt(videoPathRaw, 10) > 0
      ? (await prisma.uploads.findUnique({ where: { id: BigInt(videoPathRaw) }, select: { file_name: true } }).catch(() => null))?.file_name || null
      : null)
    : (videoPathRaw || null);

  // هوية النشر: إن نُشر الإعلان بهوية شخصية (profile_id) تُعرض بياناتها (اسم/صورة/تواصل/لون)
  // بدل بيانات الحساب الأساسي. إعلانات المتجر تبقى بعرض المتجر كما هو.
  const pubProfile = ad.profile_id ? await getProfileDisplay(toInt(ad.profile_id)).catch(() => null) : null;

  await loadBanned();
  return {
    id: toInt(ad.id),
    title: censorSync(ad.title),
    detail: censorSync(ad.detail),
    price: ad.price,
    adsType: ad.adsType,
    status: ad.status,
    state: ad.state,
    archived: !!(ad.data_archive && ad.data_archive.trim() !== ''),
    hiddenReason: ad.arc_msg ?? null,
    storeOnly: ad.store_only === 1,
    trbhhUntil: ad.trbhh_until ? ad.trbhh_until.toISOString() : null,
    urgentUntil: ad.urgent_until ? ad.urgent_until.toISOString() : null,
    expiresAt: ad.expires_at ? ad.expires_at.toISOString() : null,
    oldPrice: ad.old_price ?? 0,
    stockState: ad.stock_state ?? 0,
    priceType: ad.price_type ?? null,
    rentPeriod: ad.rent_period ?? null,
    reType: ad.re_type ?? null,
    reArea: ad.re_area ?? null,
    reLicense: ad.re_license ?? null,
    rePlot: ad.re_plot ?? null,
    rePlan: ad.re_plan ?? null,
    reDeed: ad.re_deed ?? null,
    reBeds: ad.re_beds ?? null,
    reBaths: ad.re_baths ?? null,
    reFloor: ad.re_floor ?? null,
    reAge: ad.re_age ?? null,
    reFacade: ad.re_facade ?? null,
    reStreet: ad.re_street ?? null,
    reFurnished: ad.re_furnished ?? null,
    reUse: ad.re_use ?? null,
    reStreetsCount: ad.re_streets_count ?? null,
    reFloors: ad.re_floors ?? null,
    reUnits: ad.re_units ?? null,
    reShops: ad.re_shops ?? null,
    reHalls: ad.re_halls ?? null,
    rePool: ad.re_pool ?? null,
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
    // الهوية الافتراضية تعرض بيانات الحساب الحيّة (فلا يتقادم الاسم بعد تغييره)؛
    // الهويات الفرعية فقط تعرض لقطة بياناتها المستقلة المحفوظة.
    seller: seller
      ? (() => {
          const useProfile = pubProfile?.type === 'personal' && !pubProfile.isDefault;
          return {
            id: toInt(seller.id),
            name: useProfile ? pubProfile!.name : (seller.name || seller.userName || 'مستخدم'),
            phone: useProfile ? (pubProfile!.phone || null) : (seller.allow_phone ? seller.phoneNumber : null),
            whatsapp: useProfile ? (pubProfile!.whatsapp || null) : (seller.whatsapp ? seller.phone_whatsapp || seller.phoneNumber : null),
            trusted: seller.trusted === 1,
            banned: seller.ban === 'checked',
            avatar: useProfile && pubProfile!.avatar ? pubProfile!.avatarUrl : (seller.photo_path ? mediaUrl(seller.photo_path) : null),
            color: useProfile ? pubProfile!.color : null,
            handle: useProfile ? pubProfile!.handle : null,
            memberSince: seller.created_at ? seller.created_at.toISOString() : null,
          };
        })()
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
    priceType: ad.price_type ?? null,
    rentPeriod: ad.rent_period ?? null,
    reType: ad.re_type ?? null,
    reArea: ad.re_area ?? null,
    reLicense: ad.re_license ?? null,
    rePlot: ad.re_plot ?? null,
    rePlan: ad.re_plan ?? null,
    reDeed: ad.re_deed ?? null,
    reBeds: ad.re_beds ?? null,
    reBaths: ad.re_baths ?? null,
    reFloor: ad.re_floor ?? null,
    reAge: ad.re_age ?? null,
    reFacade: ad.re_facade ?? null,
    reStreet: ad.re_street ?? null,
    reFurnished: ad.re_furnished ?? null,
    reUse: ad.re_use ?? null,
    reStreetsCount: ad.re_streets_count ?? null,
    reFloors: ad.re_floors ?? null,
    reUnits: ad.re_units ?? null,
    reShops: ad.re_shops ?? null,
    reHalls: ad.re_halls ?? null,
    rePool: ad.re_pool ?? null,
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
/* ---- الإعلانات المشابهة: تشابه حقيقي بالكلمات (العنوان + التفاصيل) ---- */

// كلمات عامة لا تدل على التشابه (تُستبعد من المطابقة)
const SIMILAR_STOP = new Set([
  'على', 'من', 'في', 'الى', 'إلى', 'عن', 'مع', 'او', 'أو', 'هذا', 'هذه', 'ذلك',
  'التي', 'الذي', 'كل', 'بعد', 'قبل', 'عند', 'حتى', 'اذا', 'إذا', 'ثم', 'لكن',
  'قد', 'يوجد', 'متوفر', 'متوفره', 'للبيع', 'مطلوب', 'جديد', 'جديده', 'مستعمل',
  'مستعمله', 'بيع', 'شراء', 'سعر', 'ريال', 'رس', 'بسعر', 'اسعار', 'خصم', 'عرض',
  'خدمه', 'خدمات', 'جميع', 'وجميع', 'لدينا', 'لدي', 'الان', 'فقط', 'the', 'and', 'for',
]);

/** توحيد الكلمة العربية: إزالة التشكيل والتطويل وتوحيد الألف/الهاء/الياء وحذف «ال». */
function simToken(w: string): string {
  const t = w
    .replace(/[ـً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
  return t.startsWith('ال') && t.length > 4 ? t.slice(2) : t;
}

function simTokens(text: string): string[] {
  return (text || '')
    .split(/[^\p{L}\p{N}]+/u)
    .map(simToken)
    .filter((t) => t.length >= 3 && !SIMILAR_STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * إعلانات مشابهة بدلالة النص: تُستخرج كلمات العنوان والتفاصيل ويُرتَّب
 * المرشحون بعدد الكلمات المشتركة (كلمات العنوان بوزن مضاعف). المرشحون من
 * نفس القسم + إعلانات من أقسام أخرى تحمل أهم كلمات العنوان. عند غياب
 * تشابه نصي كافٍ نكمل بأحدث إعلانات القسم كما سبق.
 */
export async function getSimilarAds(adId: number, categoryId: number, take = 6) {
  const src = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { title: true, detail: true } }).catch(() => null);
  const titleTokens = new Set(simTokens(src?.title || ''));
  const detailTokens = new Set(simTokens((src?.detail || '').slice(0, 400)));

  // مرشحون: أحدث إعلانات نفس القسم + إعلانات تحمل أهم كلمات العنوان من أي قسم
  const topWords = [...titleTokens].sort((a, b) => b.length - a.length).slice(0, 3);
  const [sameCat, byTitle] = await Promise.all([
    prisma.ads.findMany({
      where: { ...(await activeAdWhere()), category_id: BigInt(categoryId), id: { not: BigInt(adId) } },
      orderBy: { id: 'desc' },
      take: 200,
      select: { ...adSelect },
    }),
    topWords.length
      ? prisma.ads.findMany({
          where: { ...(await activeAdWhere()), id: { not: BigInt(adId) }, OR: topWords.map((w) => ({ title: { contains: w } })) },
          orderBy: { id: 'desc' },
          take: 100,
          select: { ...adSelect },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const seen = new Set<number>();
  const candidates = [...sameCat, ...byTitle].filter((r) => (seen.has(toInt(r.id)) ? false : (seen.add(toInt(r.id)), true)));

  // الترتيب: كلمة عنوان مشتركة = نقطتان، كلمة تفاصيل = نقطة — ثم الأحدث
  const scored = candidates
    .map((r) => {
      const ct = simTokens(r.title || '');
      let score = 0;
      for (const t of new Set(ct)) {
        if (titleTokens.has(t)) score += 2;
        else if (detailTokens.has(t)) score += 1;
      }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score || toInt(b.r.id) - toInt(a.r.id));

  const withSim = scored.filter((s) => s.score > 0).slice(0, take).map((s) => s.r);
  // إكمال العدد بأحدث إعلانات القسم عند قلة المتشابهات
  const fill = scored.filter((s) => s.score === 0 && toInt(s.r.category_id) === categoryId).map((s) => s.r);
  const rows = [...withSim, ...fill].slice(0, take);
  return toCards(rows);
}

/* ---- تغذية مخصّصة بدلالة المحتوى (بلا واجهة أقسام على الموقع) ---- */

/**
 * اهتمام الزائر يُستنتَج من نصوص ما تصفّحه فعلاً: عناوين الإعلانات والمتاجر
 * التي زارها + بحثه المحفوظ (إشارة أقوى) — بنفس أسلوب مطابقة الكلمات
 * المستخدم في «إعلانات مشابهة».
 */
export async function getPersonalizedAds(viewerKey: string | null, userId: number, take = 8) {
  if (!viewerKey) return [];
  const [viewedAds, visitedStores, saved] = await Promise.all([
    prisma.ads_views.findMany({ where: { user_id: viewerKey }, orderBy: { id: 'desc' }, take: 40, select: { ads_id: true } }).catch(() => []),
    prisma.store_visits.findMany({ where: { viewer: viewerKey }, orderBy: { id: 'desc' }, take: 20, select: { store_id: true } }).catch(() => []),
    userId ? prisma.saved_searches.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' }, take: 10, select: { query: true } }).catch(() => []) : Promise.resolve([]),
  ]);
  const viewedAdIds = [...new Set(viewedAds.map((v) => v.ads_id))];
  const visitedStoreIds = [...new Set(visitedStores.map((v) => v.store_id))];
  if (!viewedAdIds.length && !visitedStoreIds.length && !saved.length) return [];

  const [seenAds, seenStores] = await Promise.all([
    viewedAdIds.length ? prisma.ads.findMany({ where: { id: { in: viewedAdIds } }, select: { title: true, detail: true } }).catch(() => []) : Promise.resolve([]),
    visitedStoreIds.length ? prisma.stores.findMany({ where: { id: { in: visitedStoreIds } }, select: { store_name: true, tagline: true, about: true } }).catch(() => []) : Promise.resolve([]),
  ]);

  // ترددات الكلمات عبر كل ما تصفّحه وبحث عنه — الأعلى وزناً (تكراراً) = أهم اهتمامه
  const freq = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const t of simTokens(text || '')) freq.set(t, (freq.get(t) || 0) + weight);
  };
  for (const a of seenAds) { add(a.title, 2); add((a.detail || '').slice(0, 300), 1); }
  for (const s of seenStores) { add(s.store_name || '', 2); add(s.tagline || '', 1); add((s.about || '').slice(0, 200), 1); }
  for (const q of saved) add(q.query, 3); // بحث صريح = إشارة أقوى من مجرد تصفّح

  if (!freq.size) return [];
  const weights = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topWords = weights.slice(0, 6).map(([w]) => w);
  const weightMap = new Map(weights);

  const excludeIds = viewedAdIds.map((n) => BigInt(n));
  const candidates = await prisma.ads.findMany({
    where: {
      ...(await activeAdWhere()),
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      OR: topWords.map((w) => ({ OR: [{ title: { contains: w } }, { detail: { contains: w } }] })),
    },
    orderBy: { id: 'desc' },
    take: 200,
    select: adSelect,
  }).catch(() => []);

  const scored = candidates
    .map((r) => {
      let score = 0;
      for (const t of new Set(simTokens(r.title || ''))) score += weightMap.get(t) || 0;
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || toInt(b.r.id) - toInt(a.r.id));

  return toCards(scored.slice(0, take).map((s) => s.r));
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
