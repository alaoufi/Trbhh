import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { publicAdCardSelect, publicAdSearchWhere, toPublicAdCards } from '@/lib/data';
import { SALLA_OAUTH_SCOPE_VERSION } from '@/lib/suppliers/salla-scope-contract';
import { cjImg, cjProductImages, cjStorefrontView } from './storefront';

type Scope = 'all' | 'imported' | 'trbhh';
type Row = { id: bigint; ad_id: bigint | null; title: string; price_minor: number; stock_available: number; images: unknown; description: string | null; supplier_product_id: bigint | null; cj_source_id: bigint | null; cj_image: string | null; cj_images: string | null };
export type ApprovedPreview = { id: string; key: string; title: string; priceMinor: number; stock: number; images: string[]; description: string; imported: boolean; href: string };

/** Same explicit approval contract as /shop, with source readiness enforced before pagination.
 * Never promotes an administrator's advertisement or a paid placement to platform ownership. */
export function approvedCatalogScope(scope: Scope) {
  return Prisma.sql`FROM commerce_products cp
    LEFT JOIN supplier_products sp ON sp.commerce_product_id=cp.id
    LEFT JOIN supplier_connections sc ON sc.id=sp.connection_id AND sc.supplier_id=sp.supplier_id
    LEFT JOIN supplier_integration_profiles sip ON sip.supplier_id=sp.supplier_id
    LEFT JOIN commerce_suppliers s ON s.id=sp.supplier_id
    LEFT JOIN commerce_product_suppliers mapping ON mapping.product_id=cp.id
    LEFT JOIN commerce_suppliers mapped_supplier ON mapped_supplier.id=mapping.supplier_id
    WHERE cp.approved=1 AND cp.visible=1 AND cp.enabled=1 AND cp.currency='SAR'
      AND cp.price_minor>0 AND cp.stock_available>=0
      AND (mapping.product_id IS NULL OR mapped_supplier.active=1)
      AND (sp.id IS NULL OR (sp.active=1 AND sp.visible=1 AND sp.available=1 AND sp.quantity>0
        AND sp.currency='SAR' AND sp.sync_error='' AND s.active=1 AND sip.maintenance=0
        AND sc.status='connected' AND sc.provider='salla' AND sip.provider='salla'
        AND sc.oauth_scope_version=${SALLA_OAUTH_SCOPE_VERSION} AND sc.encrypted_tokens IS NOT NULL
        AND mapping.supplier_id=sp.supplier_id
        AND JSON_TYPE(sp.options)='ARRAY' AND JSON_LENGTH(sp.options)=0
        AND JSON_TYPE(sp.variants)='ARRAY' AND JSON_LENGTH(sp.variants)=0))
      AND NOT EXISTS (SELECT 1 FROM cj_products cj WHERE cj.commerce_product_id=cp.id AND (cj.hidden<>0 OR cj.status NOT IN ('draft','ready')))
      ${scope === 'trbhh' ? Prisma.empty : Prisma.sql`AND NOT EXISTS (SELECT 1 FROM cj_products cj_source WHERE cj_source.commerce_product_id=cp.id)`}
      ${scope === 'imported' ? Prisma.sql`AND sp.id IS NOT NULL` : Prisma.empty}`;
}

async function requirePrivateCatalog() {
  if (!(await cjStorefrontView()).isStaff) throw Error('cj_catalog_access_denied');
}

export async function countApprovedCatalog(scope: Scope): Promise<number> {
  await requirePrivateCatalog();
  const [row] = await prisma.$queryRaw<{ total: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS total ${approvedCatalogScope(scope)}`);
  const total = Number(row?.total);
  if (!Number.isSafeInteger(total) || total < 0) throw Error('cj_catalog_invalid_count');
  return total;
}

const fields = Prisma.sql`cp.id,cp.ad_id,cp.title,cp.price_minor,cp.stock_available,sp.images,sp.description,sp.id AS supplier_product_id,
  (SELECT MIN(cj.id) FROM cj_products cj WHERE cj.commerce_product_id=cp.id) AS cj_source_id,
  (SELECT cj.image FROM cj_products cj WHERE cj.commerce_product_id=cp.id ORDER BY cj.id LIMIT 1) AS cj_image,
  (SELECT cj.images FROM cj_products cj WHERE cj.commerce_product_id=cp.id ORDER BY cj.id LIMIT 1) AS cj_images`;

function supplierImages(raw: unknown): string[] {
  let images = raw;
  if (typeof raw === 'string') { try { images = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(images)) return [];
  return [...new Set(images.slice(0, 12).flatMap(value => {
    if (typeof value !== 'string' || value.length > 2048) return [];
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'cdn.salla.sa' || url.hostname.endsWith('.cdn.salla.sa') || url.hostname === 'salla-dev.s3.eu-central-1.amazonaws.com')) return [];
      return [url.href];
    } catch { return []; }
  }))];
}

async function previews(rows: Row[]): Promise<ApprovedPreview[]> {
  const adIds = rows.flatMap(row => row.ad_id === null ? [] : [row.ad_id]);
  // A link alone never authorizes reading an unpublished member ad's media/content.
  const adRows = adIds.length ? await prisma.ads.findMany({ where: { AND: [await publicAdSearchWhere({}), { id: { in: adIds } }, { OR: [{ data_archive: null }, { data_archive: '' }] }, { OR: [{ data_delete: null }, { data_delete: '' }] }, { paused_by_owner: 0, platform_hidden_at: null, platform_archived_at: null }, { OR: [{ publish_at: null }, { publish_at: { lte: new Date() } }] }] }, select: publicAdCardSelect }) : [];
  const cards = adRows.length ? await toPublicAdCards(adRows) : [];
  const imagesByAd = new Map(cards.map(ad => [String(ad.id), ad.image]));
  return rows.map(row => {
    const images = row.cj_source_id != null ? cjProductImages({ image: row.cj_image ?? '', images: row.cj_images }).map(cjImg) : supplierImages(row.images);
    const adImage = row.ad_id == null ? null : imagesByAd.get(String(row.ad_id));
    return { id: String(row.id), key: `commerce:${row.id}`, title: row.title, priceMinor: row.price_minor, stock: row.stock_available, images: images.length ? images : adImage ? [adImage] : [], description: row.description ?? '', imported: row.supplier_product_id != null || row.cj_source_id != null, href: `/cj/approved/${row.id}` };
  });
}

export async function listApprovedCatalog(scope: Scope, take: number, skip: number): Promise<ApprovedPreview[]> {
  await requirePrivateCatalog();
  if (!Number.isSafeInteger(take) || take < 1 || take > 24 || !Number.isSafeInteger(skip) || skip < 0) throw Error('cj_catalog_invalid_page');
  return previews(await prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${fields} ${approvedCatalogScope(scope)} ORDER BY cp.id DESC LIMIT ${take} OFFSET ${skip}`));
}

export async function getApprovedPreview(id: string): Promise<ApprovedPreview | null> {
  await requirePrivateCatalog();
  if (!/^[1-9]\d{0,14}$/.test(id)) return null;
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${fields} ${approvedCatalogScope('trbhh')} AND cp.id=${BigInt(id)} LIMIT 1`);
  return (await previews(rows))[0] ?? null;
}
