import 'server-only';
import { Prisma } from '@prisma/client';
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
  name_ar: string;
  hidden: number;
  sale_price_override_minor: number | null;
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
  nameAr?: string | null;
  image?: string;
  price: PriceBreakdown;
};

/** يُدرِج/يحدّث صفّ منتج CJ (idempotent) — لا تكرار بفضل مفتاح التفرّد.
 *  ملاحظة: عند إعادة الاستيراد لا نطمس تعديلات المشرف (name_ar/hidden/override) —
 *  نحدّث الاسم الإنجليزي والصورة والتكلفة فقط، ونضع الترجمة الأولية إن كانت فارغة. */
export async function upsertCjProduct(input: UpsertCjInput): Promise<void> {
  const p = input.price;
  const nameAr = (input.nameAr ?? '').trim();
  await prisma.$executeRaw`
    INSERT INTO cj_products
      (cj_product_id, cj_variant_id, cj_sku, name, name_ar, image,
       supplier_cost_minor, shipping_cost_minor, other_costs_minor, profit_minor, sale_price_minor, margin_bps, currency, last_sync_at)
    VALUES
      (${input.cjProductId}, ${input.cjVariantId ?? ''}, ${input.cjSku ?? ''}, ${input.name ?? ''}, ${nameAr}, ${input.image ?? ''},
       ${p.supplierCostMinor}, ${p.shippingCostMinor}, ${p.otherCostsMinor}, ${p.profitMinor}, ${p.salePriceMinor}, ${p.marginBps}, ${p.currency}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      cj_sku=VALUES(cj_sku), name=VALUES(name), image=VALUES(image),
      name_ar=CASE WHEN cj_products.name_ar='' THEN VALUES(name_ar) ELSE cj_products.name_ar END,
      supplier_cost_minor=VALUES(supplier_cost_minor), shipping_cost_minor=VALUES(shipping_cost_minor),
      other_costs_minor=VALUES(other_costs_minor), profit_minor=VALUES(profit_minor),
      sale_price_minor=VALUES(sale_price_minor), margin_bps=VALUES(margin_bps), currency=VALUES(currency),
      last_sync_at=CURRENT_TIMESTAMP(3)`;
}

export async function listCjProducts(limit = 50): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 200);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** السلع الظاهرة (غير المخفية) للمعاينة — الاسم العربي والسعر النهائي (override إن وُجد). */
export async function listVisibleCjProducts(limit = 120): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 500);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE hidden=0 ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** صفّ واحد بمعرّفه. */
export async function getCjProductById(id: number): Promise<CjProductRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE id=${BigInt(id)} LIMIT 1`.catch(() => [] as CjProductRow[]);
  return rows[0] ?? null;
}

/** تحديث الاسم العربي (تحرير يدوي أو ناتج ترجمة). */
export async function setCjProductNameAr(id: number, nameAr: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`UPDATE cj_products SET name_ar=${nameAr.slice(0, 400)} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** إخفاء/إظهار السلعة من المعاينة والنشر لاحقاً. */
export async function setCjProductHidden(id: number, hidden: boolean): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`UPDATE cj_products SET hidden=${hidden ? 1 : 0} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** تعديل سعر البيع النهائي يدوياً (بالهللة) أو إلغاؤه (null → العودة للسعر المحسوب). */
export async function setCjProductPriceOverride(id: number, minor: number | null): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  if (minor === null) { await prisma.$executeRaw`UPDATE cj_products SET sale_price_override_minor=NULL WHERE id=${BigInt(id)}`.catch(() => {}); return; }
  const v = Math.max(0, Math.round(minor));
  await prisma.$executeRaw`UPDATE cj_products SET sale_price_override_minor=${v} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** السلع التي لا اسم عربي لها بعد (للترجمة الجماعية). */
export async function listUntranslatedCjProducts(limit = 40): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 100);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE name_ar='' AND name<>'' ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

export async function countCjProducts(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) c FROM cj_products`.catch(() => [] as { c: bigint }[]);
  return Number(rows[0]?.c ?? 0);
}

/** حذف منتج مستورد من التخزين الوسيط (لا يؤثر على أي منتج عام). */
export async function removeCjProductById(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`DELETE FROM cj_products WHERE id=${BigInt(id)}`.catch(() => {});
}

/** مجموعة معرّفات CJ المستوردة مسبقاً من بين قائمة (لتعليم «مستورد» في التصفّح). */
export async function importedCjPids(pids: string[]): Promise<Set<string>> {
  const clean = [...new Set(pids.filter((p) => /^[0-9A-Za-z_-]{1,64}$/.test(p)))];
  if (!clean.length) return new Set();
  const rows = await prisma.$queryRaw<{ cj_product_id: string }[]>(
    Prisma.sql`SELECT DISTINCT cj_product_id FROM cj_products WHERE cj_product_id IN (${Prisma.join(clean)})`,
  ).catch(() => [] as { cj_product_id: string }[]);
  return new Set(rows.map((r) => r.cj_product_id));
}
