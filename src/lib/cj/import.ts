import 'server-only';
import { getProduct as cjGet } from './client';
import { readCjAvailability, type AvailabilityDeps } from './availability';
import { collectCjProductImages } from './media';
import { upsertCjProduct, buildCjDetails } from './mapping';
import { computePrice, defaultMarginBps } from './pricing';
import { cjSyncSettings, type CjSyncSettings } from './sync';
import { translateToArabicCached } from './translate';
import type { CjResult, CjProductDetail } from './types';

/**
 * استيراد منتج CJ مختار (بمعرّفه PID) إلى جدول التخزين الوسيط cj_products مع تسعيره.
 * قراءة فقط من CJ (تفاصيل المنتج)، وكتابة فقط في جدولنا — لا طلب/دفع/تعديل في CJ،
 * ولا عرض للعامة (المنتج يبقى staging حتى يُربط ويُعتمد لاحقاً). التسعير:
 * التكلفة = سعر CJ بالدولار × سعر الصرف، + شحن تقديري، + الهامش الافتراضي.
 */
export type CjImportDeps = {
  createOnly?: boolean;
  getProduct?: (pid: string) => Promise<CjResult<CjProductDetail>>;
  availability?: AvailabilityDeps;
  settings?: () => Promise<CjSyncSettings>;
  marginBps?: () => Promise<number>;
  upsert?: typeof upsertCjProduct;
  translate?: (text: string | null | undefined) => Promise<string | null>;
};
export type CjImportResult =
  | { ok: true; pid: string; name: string; salePriceMinor: number; supplierCostMinor: number }
  | { ok: false; error: string };

export async function importCjProductByPid(pid: string, deps: CjImportDeps = {}): Promise<CjImportResult> {
  const clean = String(pid || '').trim();
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(clean)) return { ok: false, error: 'bad_pid' };
  const getProduct = deps.getProduct ?? cjGet;
  const [settings, margin] = await Promise.all([(deps.settings ?? cjSyncSettings)(), (deps.marginBps ?? defaultMarginBps)()]);
  const upsert = deps.upsert ?? upsertCjProduct;

  const r = await getProduct(clean);
  if (!r.ok) return { ok: false, error: r.error };
  const d = r.data;
  const costMinor = d.sellPrice != null && d.sellPrice > 0 ? Math.round(d.sellPrice * settings.usdToSarX100) : 0;
  const price = computePrice(costMinor, settings.shippingMinor, 0, margin);
  // ترجمة تلقائية للعنوان/الوصف/التصنيف إلى العربية (حقول عرض منفصلة؛ لا نطمس المصدر).
  const translate = deps.translate ?? translateToArabicCached;
  const plainDescription = (d.description || '').replace(/<\/(?:p|div|li|br|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s{2,}/g, ' ').trim();
  const [nameAr, descAr, catAr] = await Promise.all([
    translate(d.productName || '').catch(() => null),
    translate(plainDescription).catch(() => null),
    translate(d.categoryName || '').catch(() => null),
  ]);
  // معرض الصور: صورة المنتج + صور المتغيّرات + صور مضمّنة في الوصف (غالباً الصور الحقيقية).
  const gallery = collectCjProductImages(d);
  const detailsJson = JSON.stringify(buildCjDetails(d.variants ?? []));
  // Verify stock by the product's full variant inventory and request a Saudi
  // freight estimate. If either read fails or gives no available route, keep
  // the product in staff staging but make it ineligible for public display.
  const availabilityJson = await readCjAvailability(clean, d.variants ?? [], deps.availability);
  await upsert({
    cjProductId: clean, cjSku: d.productSku || '', name: d.productName || '', nameAr,
    sourceDescription: d.description || null, descriptionAr: descAr,
    // Never present a failed English translation as an Arabic category label.
    trbhhCategory: catAr || '', sourceCategory: d.categoryName || '', image: gallery[0] || '', images: gallery, detailsJson, availabilityJson, price,
  }, { createOnly: deps.createOnly === true });
  return { ok: true, pid: clean, name: d.productName || '', salePriceMinor: price.salePriceMinor, supplierCostMinor: price.supplierCostMinor };
}
