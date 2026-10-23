import 'server-only';
import { setSetting } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import type { AdCard } from '@/lib/data';
import { parseCjImages, type CjProductRow } from '@/lib/cj/mapping';

/** يمرّر رابط صورة CJ عبر وسيط الخادم (بلا تخزين) لتفادي منع التحميل. غير CJ يبقى كما هو. */
export function cjImg(url: string | null | undefined): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  const host = (() => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } })();
  const cjCdn = /(^|\.)cjdropshipping\.(com|cn)$/.test(host);
  const cjOss = /^cc-west-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(host);
  return u.startsWith('https://') && (cjCdn || cjOss) ? `/api/cj/img?u=${encodeURIComponent(u)}` : u;
}

/** Saved primary first, followed only by this product's gallery; no network or fallback products. */
export function cjProductImages(row: Pick<CjProductRow, 'image' | 'images'>): string[] {
  const images = new Set<string>();
  for (const value of [row.image, ...parseCjImages(row)]) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!image) continue;
    try {
      const url = new URL(image);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      images.add(image);
    } catch { /* Ignore malformed saved image URLs. */ }
  }
  return [...images];
}

/** يحوّل السلعة المستوردة إلى بطاقة إعلان (نفس التصميم) — المورد وبيانات البائع مخفية. */
export function importedToAdCard(r: CjProductRow): AdCard {
  return {
    id: Number(r.id),
    href: `/cj/${r.id}`,
    title: r.name_ar || r.name || 'سلعة',
    price: Math.round((r.sale_price_override_minor ?? r.sale_price_minor) / 100),
    adsType: 'sale',
    image: cjImg(cjProductImages(r)[0]),
    cityName: null,
    categoryName: r.trbhh_category || null,
    createdAt: null,
    special: false,
    urgent: false,
    views: 0,
    sellerName: null,
    sellerTrusted: false,
    tier: '',
  };
}

/** Administrative trial only. A saved legacy flag cannot reopen public access. */
const KEY = 'cj_storefront_public';

export async function cjStorefrontPublic(): Promise<boolean> {
  return false;
}
export async function setCjStorefrontPublic(v: boolean): Promise<void> {
  if (v) throw new Error('cj_storefront_admin_only');
  await setSetting(KEY, '0');
}

export type StorefrontView = { visible: boolean; isPublic: boolean; isStaff: boolean };

/** Only an authenticated products:view grant permits preview. Fail closed. */
export async function cjStorefrontView(): Promise<StorefrontView> {
  const isPublic = false;
  const session = await getSession().catch(() => null);
  const isStaff = session ? await hasAccess(session.uid, 'products', 'view').catch(() => false) : false;
  return { visible: isStaff, isPublic, isStaff };
}
