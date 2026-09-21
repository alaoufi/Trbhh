import 'server-only';
import { prisma } from '@/lib/prisma';
import type { PriceBreakdown } from './pricing';

/**
 * ربط منتجات CJ بمنتجات تربح (والاحتفاظ بتفصيل التسعير) في جدول cj_products.
 * مفتاح التفرّد (cj_product_id, cj_variant_id) يمنع تكرار المنتجات عند إعادة المزامنة.
 */
export type CjProductRow = {
  id: number;
  cj_product_id: string;
  cj_variant_id: string;
  cj_sku: string;
  name: string;
  image: string;
  supplier_cost_minor: number;
  shipping_cost_minor: number;
  other_costs_minor: number;
  profit_minor: number;
  sale_price_minor: number;
  margin_bps: number;
  currency: string;
  commerce_product_id: bigint | null;
  trbhh_variant_id: string;
  last_sync_at: Date | null;
};

export type UpsertCjInput = {
  cjProductId: string;
  cjVariantId?: string;
  cjSku?: string;
  name?: string;
  image?: string;
  price: PriceBreakdown;
};

/** يُدرِج/يحدّث صفّ منتج CJ (idempotent) — لا تكرار بفضل مفتاح التفرّد. */
export async function upsertCjProduct(input: UpsertCjInput): Promise<void> {
  const p = input.price;
  await prisma.$executeRaw`
    INSERT INTO cj_products
      (cj_product_id, cj_variant_id, cj_sku, name, image,
       supplier_cost_minor, shipping_cost_minor, other_costs_minor, profit_minor, sale_price_minor, margin_bps, currency, last_sync_at)
    VALUES
      (${input.cjProductId}, ${input.cjVariantId ?? ''}, ${input.cjSku ?? ''}, ${input.name ?? ''}, ${input.image ?? ''},
       ${p.supplierCostMinor}, ${p.shippingCostMinor}, ${p.otherCostsMinor}, ${p.profitMinor}, ${p.salePriceMinor}, ${p.marginBps}, ${p.currency}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      cj_sku=VALUES(cj_sku), name=VALUES(name), image=VALUES(image),
      supplier_cost_minor=VALUES(supplier_cost_minor), shipping_cost_minor=VALUES(shipping_cost_minor),
      other_costs_minor=VALUES(other_costs_minor), profit_minor=VALUES(profit_minor),
      sale_price_minor=VALUES(sale_price_minor), margin_bps=VALUES(margin_bps), currency=VALUES(currency),
      last_sync_at=CURRENT_TIMESTAMP(3)`;
}

export async function listCjProducts(limit = 50): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 200);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

export async function countCjProducts(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) c FROM cj_products`.catch(() => [] as { c: bigint }[]);
  return Number(rows[0]?.c ?? 0);
}
