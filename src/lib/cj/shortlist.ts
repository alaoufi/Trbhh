import 'server-only';

import { prisma } from '@/lib/prisma';
import { getProduct } from './client';
import { computePrice, defaultMarginBps } from './pricing';
import { cjSyncSettings } from './sync';

export const CJ_SHORTLIST_STATUSES = [
  'candidate',
  'review',
  'price_requested',
  'price_received',
  'approved',
  'ready_to_publish',
  'published',
] as const;

export type CjShortlistStatus = (typeof CJ_SHORTLIST_STATUSES)[number];

export const CJ_SHORTLIST_STATUS_LABELS: Record<CjShortlistStatus, string> = {
  candidate: 'مرشح',
  review: 'تحت المراجعة',
  price_requested: 'طلب سعر خاص',
  price_received: 'تم استلام السعر',
  approved: 'معتمد',
  ready_to_publish: 'جاهز للنشر',
  published: 'منشور',
};

export type CjShortlistRow = {
  id: bigint;
  cj_product_id: string;
  cj_variant_id: string;
  cj_sku: string;
  name: string;
  image: string;
  category_name: string;
  supplier_cost_minor: number;
  shipping_cost_minor: number;
  sale_price_minor: number;
  margin_bps: number;
  status: CjShortlistStatus;
  created_at: Date;
  updated_at: Date;
};

function cleanPid(value: string): string | null {
  const pid = String(value || '').trim();
  return /^[0-9A-Za-z_-]{1,64}$/.test(pid) ? pid : null;
}

export async function addCjProductsToShortlist(pids: string[]): Promise<{ added: number; failed: number }> {
  const unique = [...new Set(pids.map(cleanPid).filter((v): v is string => !!v))].slice(0, 40);
  if (!unique.length) return { added: 0, failed: 0 };

  const [settings, marginBps] = await Promise.all([cjSyncSettings(), defaultMarginBps()]);
  let added = 0;
  let failed = 0;

  // Sequential on purpose: CJ has strict rate limits and the shared client throttles requests.
  for (const pid of unique) {
    const result = await getProduct(pid);
    if (!result.ok) {
      failed += 1;
      continue;
    }
    const product = result.data;
    const supplierCostMinor =
      product.sellPrice != null && product.sellPrice > 0
        ? Math.round(product.sellPrice * settings.usdToSarX100)
        : 0;
    const price = computePrice(supplierCostMinor, settings.shippingMinor, 0, marginBps);
    const firstVariant = product.variants[0];

    await prisma.$executeRaw`
      INSERT INTO cj_shortlist
        (cj_product_id, cj_variant_id, cj_sku, name, image, category_name,
         supplier_cost_minor, shipping_cost_minor, sale_price_minor, margin_bps, status)
      VALUES
        (${pid}, ${firstVariant?.vid ?? ''}, ${product.productSku || firstVariant?.variantSku || ''},
         ${product.productName || ''}, ${product.productImage || ''}, ${product.categoryName || ''},
         ${price.supplierCostMinor}, ${price.shippingCostMinor}, ${price.salePriceMinor}, ${price.marginBps}, 'candidate')
      ON DUPLICATE KEY UPDATE
        cj_variant_id=VALUES(cj_variant_id),
        cj_sku=VALUES(cj_sku),
        name=VALUES(name),
        image=VALUES(image),
        category_name=VALUES(category_name),
        supplier_cost_minor=VALUES(supplier_cost_minor),
        shipping_cost_minor=VALUES(shipping_cost_minor),
        sale_price_minor=VALUES(sale_price_minor),
        margin_bps=VALUES(margin_bps),
        updated_at=CURRENT_TIMESTAMP(3)
    `;
    added += 1;
  }

  return { added, failed };
}

export async function listCjShortlist(limit = 100): Promise<CjShortlistRow[]> {
  const take = Math.min(Math.max(1, limit), 300);
  return prisma.$queryRaw<CjShortlistRow[]>`
    SELECT id, cj_product_id, cj_variant_id, cj_sku, name, image, category_name,
           supplier_cost_minor, shipping_cost_minor, sale_price_minor, margin_bps,
           status, created_at, updated_at
    FROM cj_shortlist
    ORDER BY id DESC
    LIMIT ${take}
  `.catch(() => [] as CjShortlistRow[]);
}

export async function updateCjShortlistStatus(id: bigint, status: string): Promise<boolean> {
  if (id <= 0n || !CJ_SHORTLIST_STATUSES.includes(status as CjShortlistStatus)) return false;
  const changed = await prisma.$executeRaw`
    UPDATE cj_shortlist
    SET status=${status}, updated_at=CURRENT_TIMESTAMP(3)
    WHERE id=${id}
  `.catch(() => 0);
  return Number(changed) > 0;
}

export async function removeCjShortlistItem(id: bigint): Promise<void> {
  if (id <= 0n) return;
  await prisma.$executeRaw`DELETE FROM cj_shortlist WHERE id=${id}`.catch(() => {});
}
