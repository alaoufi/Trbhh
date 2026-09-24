import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { PriceBreakdown } from './pricing';
import type { CjVariant } from './types';

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
  source_category: string;
  status: string;
  images: string | null;
  details_json: string | null;
  availability_json: string | null;
  availability_checked_at: Date | null;
  agent_user_id: bigint | null;
  agent_claimed_at: Date | null;
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
  sourceCategory?: string | null;
  image?: string;
  images?: string[];
  detailsJson?: string | null;
  availabilityJson?: string | null;
  price: PriceBreakdown;
};

export type CjAvailability = {
  checkedAt: string;
  stockQuantity: number;
  variants: { vid: string; stockQuantity: number; shippingOptions: { name: string; priceMinor: number; additionalMinor?: number; currency?: 'SAR'; deliveryDays: string | null; originCountry?: string }[] }[];
  shippingOptions: { name: string; priceMinor: number; additionalMinor?: number; currency?: 'SAR'; deliveryDays: string | null; originCountry?: string }[];
};

function validSaudiQuote(option: unknown): option is CjAvailability['shippingOptions'][number] {
  if (!option || typeof option !== 'object') return false;
  const row = option as Record<string, unknown>;
  const amount = Number.isSafeInteger(row.priceMinor) && Number(row.priceMinor) >= 0 || Number.isFinite(row.priceUsd) && Number(row.priceUsd) >= 0;
  return typeof row.name === 'string' && !!row.name.trim() && amount &&
    (row.additionalMinor === undefined || Number.isSafeInteger(row.additionalMinor) && Number(row.additionalMinor) >= 0) &&
    (row.originCountry === undefined || typeof row.originCountry === 'string' && /^[A-Z]{2}$/.test(row.originCountry));
}
function validVariantSaudiQuote(option: unknown): option is CjAvailability['shippingOptions'][number] {
  return validSaudiQuote(option) && Number.isSafeInteger((option as { priceMinor?: unknown }).priceMinor) &&
    (option as { currency?: unknown }).currency === 'SAR' && typeof (option as { originCountry?: unknown }).originCountry === 'string' &&
    /^[A-Z]{2}$/.test((option as { originCountry: string }).originCountry);
}

/** لا نعرض سعراً تقديرياً بديلاً عن إثبات حديث للمخزون والشحن لكل خيار. */
export function parseCjAvailability(row: Pick<CjProductRow, 'availability_json'>, now = Date.now()): CjAvailability | null {
  try {
    const value = JSON.parse(row.availability_json ?? '') as Partial<CjAvailability>;
    const checkedAt = typeof value.checkedAt === 'string' ? Date.parse(value.checkedAt) : NaN;
    if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > 6 * 60 * 60 * 1000) return null;
    if (!Number.isSafeInteger(value.stockQuantity) || (value.stockQuantity ?? 0) < 1 || !Array.isArray(value.variants) || !Array.isArray(value.shippingOptions)) return null;
    const variants = value.variants.flatMap(raw => {
      if (!raw || typeof raw.vid !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.vid) || !Number.isSafeInteger(raw.stockQuantity) || raw.stockQuantity < 1 || !Array.isArray(raw.shippingOptions)) return [];
      const quotes = raw.shippingOptions.filter(validVariantSaudiQuote);
      return quotes.length ? [{ ...raw, shippingOptions: quotes }] : [];
    });
    const shippingOptions = value.shippingOptions.filter(validSaudiQuote);
    const verifiedTotal = variants.reduce((total, variant) => total + variant.stockQuantity, 0);
    if (!variants.length || !shippingOptions.length || verifiedTotal < 1) return null;
    return { checkedAt: new Date(checkedAt).toISOString(), stockQuantity: verifiedTotal, variants, shippingOptions };
  } catch { return null; }
}

/** يفكّ معرض صور السلعة المخزَّن (JSON) إلى مصفوفة روابط. */
export function parseCjImages(row: Pick<CjProductRow, 'images' | 'image'>): string[] {
  const out: string[] = [];
  try { const arr = row.images ? JSON.parse(row.images) : []; if (Array.isArray(arr)) for (const s of arr) if (typeof s === 'string' && s) out.push(s); } catch { /* تجاهل */ }
  if (!out.length && row.image) out.push(row.image);
  return [...new Set(out)];
}

/** تفاصيل غنية مخزَّنة للسلعة (متغيّرات/مواصفات) — للعرض بلا اتصال حيّ. */
export type CjDetails = {
  variants: { vid: string; name: string; optionKey: string; sku: string; priceUsd: number | null; weight: number | null;attributes?:Record<string,unknown> }[];
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
export function buildCjDetails(variants: CjVariant[]): CjDetails {
  const list = (variants ?? []).map((v) => ({ vid: v.vid, name: (v.variantName ?? '').trim(), optionKey: (v.variantKey ?? '').trim(), sku: v.variantSku, priceUsd: v.variantSellPrice, weight: v.variantWeight,attributes:v.attributes??{} }));
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
export async function upsertCjProduct(input: UpsertCjInput, opts: { createOnly?: boolean } = {}): Promise<void> {
  const p = input.price;
  const nameAr = (input.nameAr ?? '').trim();
  const srcDesc = input.sourceDescription ?? null;
  const descAr = (input.descriptionAr ?? '') || null;
  const category = (input.trbhhCategory ?? '').trim();
  const imagesJson = input.images && input.images.length ? JSON.stringify([...new Set(input.images.filter(Boolean))].slice(0, 12)) : null;
  const detailsJson = input.detailsJson ?? null;
  await prisma.$executeRaw`
    INSERT INTO cj_products
      (cj_product_id, cj_variant_id, cj_sku, name, name_ar, source_description, display_description_ar, trbhh_category, source_category, image, images, details_json, availability_json, availability_checked_at,
       supplier_cost_minor, shipping_cost_minor, other_costs_minor, profit_minor, sale_price_minor, margin_bps, currency, last_sync_at)
    VALUES
      (${input.cjProductId}, ${input.cjVariantId ?? ''}, ${input.cjSku ?? ''}, ${input.name ?? ''}, ${nameAr}, ${srcDesc}, ${descAr}, ${category}, ${(input.sourceCategory ?? '').slice(0, 200)}, ${input.image ?? ''}, ${imagesJson}, ${detailsJson}, ${input.availabilityJson ?? null}, ${input.availabilityJson ? Prisma.sql`UTC_TIMESTAMP(3)` : Prisma.sql`NULL`},
       ${p.supplierCostMinor}, ${p.shippingCostMinor}, ${p.otherCostsMinor}, ${p.profitMinor}, ${p.salePriceMinor}, ${p.marginBps}, ${p.currency}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE ${opts.createOnly ? Prisma.sql`id=id` : Prisma.sql`
      cj_sku=VALUES(cj_sku), name=VALUES(name), image=VALUES(image),
      images=CASE WHEN VALUES(images) IS NOT NULL THEN VALUES(images) ELSE cj_products.images END,
      details_json=CASE WHEN VALUES(details_json) IS NOT NULL THEN VALUES(details_json) ELSE cj_products.details_json END,
      availability_json=VALUES(availability_json),
      availability_checked_at=VALUES(availability_checked_at),
      source_description=VALUES(source_description),
      name_ar=CASE WHEN cj_products.name_ar='' THEN VALUES(name_ar) ELSE cj_products.name_ar END,
      display_description_ar=CASE WHEN cj_products.display_description_ar IS NULL OR cj_products.display_description_ar='' THEN VALUES(display_description_ar) ELSE cj_products.display_description_ar END,
      trbhh_category=CASE WHEN cj_products.trbhh_category='' THEN VALUES(trbhh_category) ELSE cj_products.trbhh_category END,
      source_category=VALUES(source_category),
      supplier_cost_minor=VALUES(supplier_cost_minor), shipping_cost_minor=VALUES(shipping_cost_minor),
      other_costs_minor=VALUES(other_costs_minor), profit_minor=VALUES(profit_minor),
      sale_price_minor=VALUES(sale_price_minor), margin_bps=VALUES(margin_bps), currency=VALUES(currency),
      last_sync_at=CURRENT_TIMESTAMP(3)`}`;
}

/** حفظ حقول المراجعة/العرض (عنوان/وصف عربي، تصنيف تربح، الحالة). لا يمسّ المصدر. */
export async function updateCjReview(id: number, fields: { nameAr?: string; descriptionAr?: string; trbhhCategory?: string; status?: string }): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  const nameAr = (fields.nameAr ?? '').slice(0, 400);
  const descAr = (fields.descriptionAr ?? '').slice(0, 20000) || null;
  const category = (fields.trbhhCategory ?? '').slice(0, 200);
  const status = fields.status === 'ready' ? 'ready' : 'draft';
  await prisma.$executeRaw`UPDATE cj_products SET name_ar=${nameAr}, display_description_ar=${descAr}, trbhh_category=${category}${fields.status === undefined ? Prisma.empty : Prisma.sql`, status=${status}`} WHERE id=${BigInt(id)}`;
}

/** Exact options eligible for display: same stored VID, valid price, live stock and Saudi freight proof. */
export function getVerifiedCjVariants(row: Pick<CjProductRow, 'details_json' | 'availability_json'>): CjDetails['variants'] {
  const details = parseCjDetails(row);
  const availability = parseCjAvailability(row);
  if (!details || !availability) return [];
  if (!details.variants.length || availability.variants.length !== details.variants.length) return [];
  const verified = new Map(availability.variants.map(item => [item.vid, item]));
  const vids = details.variants.map(variant => variant.vid);
  if (new Set(vids).size !== vids.length) return [];
  const allVerified = details.variants.every(variant => typeof variant.vid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(variant.vid) &&
    verified.has(variant.vid) && typeof variant.priceUsd === 'number' && Number.isFinite(variant.priceUsd) && variant.priceUsd > 0);
  return allVerified ? details.variants : [];
}

/** Approval changes no editable content, pricing or visibility fields. */
export async function setCjProductStatus(id: number, status: string): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0 || !['draft', 'ready'].includes(status)) throw new Error('invalid_product_status');
  await prisma.$executeRaw`UPDATE cj_products SET status=${status} WHERE id=${BigInt(id)}`;
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
 *  - معاينة المشرف (readyOnly=false): المسودة والجاهزة غير المخفية فقط. */
export async function listStorefrontCjProducts(readyOnly: boolean, limit = 120): Promise<CjProductRow[]> {
  const take = Math.min(Math.max(1, limit), 500);
  return readyOnly
    ? (await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE hidden=0 AND status='ready' AND (sale_price_override_minor>0 OR sale_price_minor>0) AND availability_checked_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND availability_checked_at<=UTC_TIMESTAMP(3) AND JSON_VALID(availability_json)=1 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(availability_json,'$.stockQuantity')) AS UNSIGNED)>0 AND JSON_LENGTH(JSON_EXTRACT(availability_json,'$.variants'))>0 AND JSON_LENGTH(JSON_EXTRACT(availability_json,'$.shippingOptions'))>0 ORDER BY id DESC LIMIT ${Math.min(take * 5, 2500)}`.catch(() => [] as CjProductRow[])).filter(row => !!parseCjAvailability(row) && getVerifiedCjVariants(row).length > 0).slice(0, take)
    : prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE hidden=0 AND status IN ('draft','ready') ORDER BY id DESC LIMIT ${take}`.catch(() => [] as CjProductRow[]);
}

/** سلعة متجر واحدة بمعرّفها ضمن قيود الرؤية (readyOnly للعامة). */
export async function getStorefrontCjProduct(id: number, readyOnly: boolean): Promise<CjProductRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = readyOnly
    ? await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE id=${BigInt(id)} AND hidden=0 AND status='ready' AND (sale_price_override_minor>0 OR sale_price_minor>0) AND availability_checked_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND availability_checked_at<=UTC_TIMESTAMP(3) AND JSON_VALID(availability_json)=1 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(availability_json,'$.stockQuantity')) AS UNSIGNED)>0 AND JSON_LENGTH(JSON_EXTRACT(availability_json,'$.variants'))>0 AND JSON_LENGTH(JSON_EXTRACT(availability_json,'$.shippingOptions'))>0 LIMIT 1`.catch(() => [] as CjProductRow[])
    : await prisma.$queryRaw<CjProductRow[]>`SELECT * FROM cj_products WHERE id=${BigInt(id)} AND hidden=0 AND status IN ('draft','ready') LIMIT 1`.catch(() => [] as CjProductRow[]);
  const row = rows[0] ?? null;
  return row && (!readyOnly || parseCjAvailability(row) && getVerifiedCjVariants(row).length > 0) ? row : null;
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
       OR (source_category<>'' AND (trbhh_category='' OR trbhh_category=source_category))
       OR (source_category='' AND trbhh_category REGEXP '[A-Za-z]')
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

/** Replace availability proof; null revokes any prior public-display eligibility. */
export async function setCjProductAvailability(id: number, availabilityJson: string | null): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.$executeRaw`UPDATE cj_products SET availability_json=${availabilityJson}, availability_checked_at=${availabilityJson ? Prisma.sql`UTC_TIMESTAMP(3)` : Prisma.sql`NULL`} WHERE id=${BigInt(id)}`.catch(() => {});
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

/** Preserve a legacy English category as source before replacing its display value. */
export async function setCjProductSourceCategory(id: number, category: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0 || !category) return;
  await prisma.$executeRaw`UPDATE cj_products SET source_category=${category.slice(0, 200)} WHERE id=${BigInt(id)} AND source_category=''`.catch(() => {});
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

/** نشاط السلعة (طلبات) — يمنع الحذف إن وُجد. */
export async function cjProductOrderCount(cjProductId: string): Promise<number> {
  if (!cjProductId) return 0;
  return prisma.cj_orders.count({ where: { cj_product_id: cjProductId } }).catch(() => 0);
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
