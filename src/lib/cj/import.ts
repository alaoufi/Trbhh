import 'server-only';
import { getProduct as cjGet, getVariants as cjGetVariants } from './client';
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
  getVariants?: typeof cjGetVariants;
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
  // خيارات السلعة كاملة (لون/مقاس/قابس...): نقطة المتغيّرات المخصّصة هي المصدر الموثوق
  // للقائمة الكاملة؛ قد تكون المضمّنة في تفاصيل المنتج ناقصة. نأخذ الأكثر اكتمالاً،
  // ونتراجع بأمان إلى المضمّنة عند فشل/تعذّر النداء (لا نفقد أي خيار).
  const detailVariants = d.variants ?? [];
  const variantsRes = await (deps.getVariants ?? cjGetVariants)(clean).catch(() => null);
  const queryVariants = variantsRes?.ok ? variantsRes.data : [];
  const fullVariants = (queryVariants.length >= detailVariants.length ? queryVariants : detailVariants).map(v=>({...v,optionSchema:d.optionSchema??v.optionSchema}));
  const detailsJson = JSON.stringify(buildCjDetails(fullVariants));
  // Verify stock by the product's full variant inventory and request a Saudi
  // freight estimate. If either read fails or gives no available route, keep
  // the product in staff staging but make it ineligible for public display.
  const availabilityJson = await readCjAvailability(clean, fullVariants, deps.availability);
  // توحيد التصنيف مع إعلانات تربح: نصنّف السلعة آلياً إلى أقرب قسم تربح مشابه
  // (نفس مصنّف الإعلانات وجدول الأقسام). يبقى فارغاً إن لم تُعرّف أقسام بعد، ولا
  // يُستبدل أي تصنيف يدوي سابق عند إعادة الاستيراد (محفوظ في طبقة upsert).
  let autoCategoryId: number | null = null;
  let autoCategoryLabel = '';
  try {
    const { classifyAdText } = await import('@/lib/classifier');
    const { getCategories } = await import('@/lib/data');
    const cats = await getCategories();
    if (cats.length > 0) {
      const classified = await classifyAdText(nameAr || d.productName || '', descAr || plainDescription || catAr || '');
      if (classified?.categoryId) {
        const match = cats.find(c => c.id === classified.categoryId);
        if (match) { autoCategoryId = match.id; autoCategoryLabel = match.name; }
      }
    }
  } catch { /* تعذّر التصنيف الآلي لا يمنع الاستيراد */ }
  await upsert({
    cjProductId: clean, cjSku: d.productSku || '', name: d.productName || '', nameAr,
    sourceDescription: d.description || null, descriptionAr: descAr,
    // القسم موحّد مع إعلانات تربح (معرّف + اسمه). لا نعرض تصنيف المورّد كقسم.
    trbhhCategory: autoCategoryLabel, categoryId: autoCategoryId, sourceCategory: d.categoryName || '', image: gallery[0] || '', images: gallery, detailsJson, availabilityJson, price,
  }, { createOnly: deps.createOnly === true });
  return { ok: true, pid: clean, name: d.productName || '', salePriceMinor: price.salePriceMinor, supplierCostMinor: price.supplierCostMinor };
}
