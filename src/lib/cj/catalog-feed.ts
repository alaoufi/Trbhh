import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { publicAdCardSelect, publicAdSearchWhere, toPublicAdCards, type AdCard } from '@/lib/data';
import { cjStorefrontView } from './storefront';
import type { CjProductRow } from './mapping';

export const CJ_CATALOG_TABS = [
  { id: 'all', label: 'الكل' },
  { id: 'imported', label: 'السلع المستوردة' },
  { id: 'members', label: 'اعلانات الاعضاء' },
  { id: 'verified', label: 'اعلانات موثقة' },
  { id: 'trbhh', label: 'اعلانات تربح' },
] as const;
export type CjCatalogTab = typeof CJ_CATALOG_TABS[number]['id'];
export type CjCatalogQuery = Record<string, string | string[] | undefined>;
export type CjCatalogItem = { key: string; source: 'cj'; product: CjProductRow } | { key: string; source: 'ad'; ad: AdCard };
export const CJ_CATALOG_PAGE_SIZE = 24;

export function parseCjCatalogQuery(query: CjCatalogQuery) {
  const tab = CJ_CATALOG_TABS.find(item => item.id === query.tab)?.id ?? 'all';
  const page = typeof query.page === 'string' && /^[1-9]\d{0,8}$/.test(query.page) ? Number(query.page) : 1;
  return { tab, page };
}

/** Read-only private catalog. The public listing predicates run before count/offset. */
export async function loadCjCatalog(query: CjCatalogQuery) {
  if (!(await cjStorefrontView()).isStaff) throw Error('cj_catalog_access_denied');
  const { tab, page: requestedPage } = parseCjCatalogQuery(query);
  const imports = tab === 'all' || tab === 'imported';
  const members = tab === 'all' || tab === 'members' || tab === 'verified';
  const cjWhere: Prisma.cj_productsWhereInput = { hidden: 0, status: { in: ['draft', 'ready'] } };
  let adWhere: Prisma.adsWhereInput = { id: { in: [] } };
  if (members) {
    const [publicWhere, linked, trusted] = await Promise.all([
      publicAdSearchWhere({}),
      // Exclude every linked CJ source, even hidden ones: an ad must not bypass its source gate.
      prisma.$queryRaw<{ ad_id: bigint }[]>`SELECT DISTINCT cp.ad_id FROM commerce_products cp INNER JOIN cj_products cj ON cj.commerce_product_id=cp.id WHERE cp.ad_id IS NOT NULL`,
      tab === 'verified' ? prisma.users.findMany({ where: { trusted: 1 }, select: { id: true } }) : Promise.resolve([]),
    ]);
    adWhere = { AND: [publicWhere,
      { OR: [{ data_archive: null }, { data_archive: '' }] },
      { OR: [{ data_delete: null }, { data_delete: '' }] },
      { paused_by_owner: 0, platform_hidden_at: null, platform_archived_at: null },
      { OR: [{ publish_at: null }, { publish_at: { lte: new Date() } }] },
      ...(linked.length ? [{ id: { notIn: linked.map(row => row.ad_id) } }] : []),
      ...(tab === 'verified' ? [{ user_id: { in: trusted.map(row => row.id) } }] : []),
    ] };
  }
  const [cjCount, adCount] = await Promise.all([
    imports ? prisma.cj_products.count({ where: cjWhere }) : 0,
    members ? prisma.ads.count({ where: adWhere }) : 0,
  ]);
  const total = cjCount + adCount;
  const pageCount = Math.max(1, Math.ceil(total / CJ_CATALOG_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const skip = (page - 1) * CJ_CATALOG_PAGE_SIZE;
  const cjTake = Math.max(0, Math.min(CJ_CATALOG_PAGE_SIZE, cjCount - skip));
  const adTake = Math.min(CJ_CATALOG_PAGE_SIZE - cjTake, adCount);
  const [products, rows] = await Promise.all([
    cjTake ? prisma.cj_products.findMany({ where: cjWhere, orderBy: { id: 'desc' }, skip, take: cjTake }) : [],
    adTake ? prisma.ads.findMany({ where: adWhere, orderBy: { id: 'desc' }, skip: Math.max(0, skip - cjCount), take: adTake, select: publicAdCardSelect }) : [],
  ]);
  const ads = rows.length ? await toPublicAdCards(rows) : [];
  const items: CjCatalogItem[] = [
    ...products.map(product => ({ key: `cj:${product.id}`, source: 'cj' as const, product: { ...product, id: Number(product.id) } })),
    ...ads.map(ad => ({ key: `ad:${ad.id}`, source: 'ad' as const, ad })),
  ];
  return { tab, page, pageCount, total, items };
}
