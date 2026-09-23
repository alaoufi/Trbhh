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
  source_description: string | null;
  display_description_ar: string | null;
  trbhh_category: string;
  status: string;
  images: string | null;
  details_json: string | null;
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
  sourceDescription?: string | null;
  descriptionAr?: string | null;
  trbhhCategory?: string | null;
  image?: string;
  images?: string[];
  detailsJson?: string | null;
  price: PriceBreakdown;
};

/** يفكّ معرض صور السلعة المخزَّن (JSON) إلى مصفوفة روابط. */
export function parseCjImages(row: Pick<CjProductRow, 'images' | 'image'>): string[] {
  const out: string[] = [];
  try { const arr = row.images ? JSON.parse(row.images) : []; if (Array.isArray(arr)) for (const s of arr) if (typeof s === 'string' && s) out.push(s); } catch { /* تجاهل */ }
  if (!out.length && row.image) out.push(row.image);
  return [...new Set(out)];
}

/** تفاصيل غنية مخزَّنة للسلعة (متغيّرات/مواصفات) — للعرض بلا اتصال حيّ. */
export type CjDetails = {
  variants: { name: string; sku: string; priceUsd: number | null; weight: number | null }[];
  weightMin: number | null;
  weightMax: number | null;
  variantCount: number;
};
export function parseCjDetails(row: Pick<CjProductRow, 'details_json'>): CjDetails | null {
  try {
    const d = row.details_json ? JSON.parse(row.details_json) : null;
    if (d && typeof d === 'object' && Array.isArray(d.variants)) return d as CjDetails;
  } catch { /* تجاهل */ }
  return null;
}
/** يبني تفاصيل مخزَّنة من متغيّرات CJ (بلا اتصالات إضافية). */
export function buildCjDetails(variants: { variantName: string | null; variantSku: string; variantSellPrice: number | null; variantWeight: number | null }[]): CjDetails {
  const list = (variants ?? []).map((v) => ({ name: (v.variantName ?? '').trim(), sku: v.variantSku, priceUsd: v.variantSellPrice, weight: v.variantWeight }));
  const weights = list.map((v) => v.weight).filter((w): w is number => typeof w === 'number' && w > 0);
  return { variants: list, weightMin: weights.length ? Math.min(...weights) : null, weightMax: weights.length ? Math.max(...weights) : null, variantCount: list.length };
}
/** تحديث التفاصيل المخزَّنة (تعبئة). */
export async function setCjProductDetails(id: number, details: CjDetails): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`UPDATE cj_products SET details_json=${JSON.stringify(details)} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** يُدرِج/يحدّث صفّ منتج CJ (idempotent) — لا تكرار بفضل مفتاح التفرّد.
 *  ملاحظة: عند إعادة الاستيراد لا نطمس تعديلات المشرف (name_ar/hidden/override) —
 *  نحدّث الاسم الإنجليزي والصورة والتكلفة فقط، ونضع الترجمة الأولية إن كانت فارغة. */
export async function upsertCjProduct(input: UpsertCjInput): Promise<void> {
  const p = input.price;
  const nameAr = (input.nameAr ?? '').trim();
  const srcDesc = input.sourceDescription ?? null;
  const descAr = (input.descriptionAr ?? '') || null;
  const category = (input.trbhhCategory ?? '').trim();
  const imagesJson = input.images && input.images.length ? JSON.stringify([...new Set(input.images.filter(Boolean))].slice(0, 12)) : null;
  const detailsJson = input.detailsJson ?? null;
  await prisma.$executeRaw`
    INSERT INTO cj_products
      (cj_product_id, cj_variant_id, cj_sku, name, name_ar, source_description, display_description_ar, trbhh_category, image, images, details_json,
       supplier_cost_minor, shipping_cost_minor, other_costs_minor, profit_minor, sale_price_minor, margin_bps, currency, last_sync_at)
    VALUES
      (${input.cjProductId}, ${input.cjVariantId ?? ''}, ${input.cjSku ?? ''}, ${input.name ?? ''}, ${nameAr}, ${srcDesc}, ${descAr}, ${category}, ${input.image ?? ''}, ${imagesJson}, ${detailsJson},
       ${p.supplierCostMinor}, ${p.shippingCostMinor}, ${p.otherCostsMinor}, ${p.profitMinor}, ${p.salePriceMinor}, ${p.marginBps}, ${p.currency}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      cj_sku=VALUES(cj_sku), name=VALUES(name), image=VALUES(image),
      images=CASE WHEN VALUES(images) IS NOT NULL THEN VALUES(images) ELSE cj_products.images END,
      details_json=CASE WHEN VALUES(details_json) IS NOT NULL THEN VALUES(details_json) ELSE cj_products.details_json END,
      source_description=VALUES(source_description),
      name_ar=CASE WHEN cj_products.name_ar='' THEN VALUES(name_ar) ELSE cj_products.name_ar END,
      display_description_ar=CASE WHEN cj_products.display_description_ar IS NULL OR cj_products.display_description_ar='' THEN VALUES(display_description_ar) ELSE cj_products.display_description_ar END,
      trbhh_category=CASE WHEN cj_products.trbhh_category='' THEN VALUES(trbhh_category) ELSE cj_products.trbhh_category END,
      supplier_cost_minor=VALUES(supplier_cost_minor), shipping_cost_minor=VALUES(shipping_cost_minor),
      other_costs_minor=VALUES(other_costs_minor), profit_minor=VALUES(profit_minor),
      sale_price_minor=VALUES(sale_price_minor), margin_bps=VALUES(margin_bps), currency=VALUES(currency),
      last_sync_at=CURRENT_TIMESTAMP(3)`;
}

/** حفظ حقول المراجعة/العرض (عنوان/وصف عربي، تصنيف تربح، الحالة). لا يمسّ المصدر. */
export async function updateCjReview(id: number, fields: { nameAr?: string; descriptionAr?: string; trbhhCategory?: string; status?: string }): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  const nameAr = (fields.nameAr ?? '').slice(0, 400);
  const descAr = (fields.descriptionAr ?? '').slice(0, 20000) || null;
  const category = (fields.trbhhCategory ?? '').slice(0, 200);
  const status = fields.status === 'ready' ? 'ready' : 'draft';
  await prisma.$executeRaw`UPDATE cj_products SET name_ar=${nameAr}, display_description_ar=${descAr}, trbhh_category=${category}, status=${status} WHERE id=${BigInt(id)}`.catch(() => {});
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

/** سلع متجر CJ:
 *  - العرض العام (readyOnly=true): غير مخفية وحالتها «جاهزة».
 *  - معاينة المشرف (readyOnly=false): كل غير المخفية. */
export async function listStorefrontCjProducts(readyOnly: boolean, limit = 120): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 500);
  return readyOnly
    ? prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE hidden=0 AND status='ready' ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[])
    : prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE hidden=0 ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** سلعة متجر واحدة بمعرّفها ضمن قيود الرؤية (readyOnly للعامة). */
export async function getStorefrontCjProduct(id: number, readyOnly: boolean): Promise<CjProductRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = readyOnly
    ? await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE id=${BigInt(id)} AND hidden=0 AND status='ready' LIMIT 1`.catch(() => [] as CjProductRow[])
    : await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE id=${BigInt(id)} AND hidden=0 LIMIT 1`.catch(() => [] as CjProductRow[]);
  return rows[0] ?? null;
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

/** السلع التي ينقصها اسم/وصف عربي — للتهيئة المجدولة. */
export async function listProductsNeedingArabic(limit = 100): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 200);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products
    WHERE (name_ar='' AND name<>'')
       OR ((display_description_ar IS NULL OR display_description_ar='') AND source_description IS NOT NULL AND source_description<>'')
    ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** تحديث صورة السلعة (تعبئة أو إصلاح). */
export async function setCjProductImage(id: number, url: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0 || !url) return;
  await prisma.$executeRaw`UPDATE cj_products SET image=${url.slice(0, 1024)} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** تحديث معرض صور السلعة (JSON) + الصورة الرئيسية (أول صورة). */
export async function setCjProductGallery(id: number, images: string[]): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  const clean = [...new Set(images.filter(Boolean))].slice(0, 12);
  if (!clean.length) return;
  const json = JSON.stringify(clean);
  await prisma.$executeRaw`UPDATE cj_products SET images=${json}, image=${clean[0].slice(0, 1024)} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** السلع بلا صورة/معرض مخزَّن — لتعبئتها من CJ. */
export async function listProductsMissingImage(limit = 40): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 100);
  return prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE (image='' OR image IS NULL OR images IS NULL OR details_json IS NULL) ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** تحديث وسم تصنيف تربح. */
export async function setCjProductCategory(id: number, category: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`UPDATE cj_products SET trbhh_category=${category.slice(0, 200)} WHERE id=${BigInt(id)}`.catch(() => {});
}

/** تحديث الوصف العربي المعروض. */
export async function setCjProductDescriptionAr(id: number, descAr: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  const v = descAr.slice(0, 20000) || null;
  await prisma.$executeRaw`UPDATE cj_products SET display_description_ar=${v} WHERE id=${BigInt(id)}`.catch(() => {});
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
