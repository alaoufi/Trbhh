import 'server-only';
import { getCategories, getProduct } from './client';
import { translateManyCached, translateToArabicCached } from './translate';
import { listProductsNeedingArabic, setCjProductNameAr, setCjProductDescriptionAr, listProductsMissingImage, setCjProductGallery, setCjProductDetails, buildCjDetails } from './mapping';

/**
 * تهيئة (warming) الترجمات على الخادم — تُشغَّل أسبوعياً (كرون داخلي) أو يدوياً.
 * تترجم شجرة تصنيفات CJ وحقول السلع المستوردة الناقصة (اسم/وصف/تصنيف) وتخزّنها في
 * قاعدة البيانات (cj_translations + cj_products) — فيصبح التصفّح سريعاً (من المخزَّن)
 * وآمناً (دفعة متحكّم بها لا طلبات حيّة عند كل تحميل). idempotent: المترجَم مسبقاً يُتجاوز.
 */
export type WarmResult = { categories: number; productNames: number; productDescriptions: number; images: number };

export async function warmCjTranslations(opts: { categoryMax?: number; productMax?: number; imageMax?: number } = {}): Promise<WarmResult> {
  const out: WarmResult = { categories: 0, productNames: 0, productDescriptions: 0, images: 0 };

  // 1) شجرة التصنيفات (منتهية العدد — تُخزَّن مرّة وتبقى فورية).
  const cats = await getCategories().catch(() => null);
  if (cats && cats.ok) {
    const map = await translateManyCached(cats.data.map((c) => c.name), opts.categoryMax ?? 400);
    out.categories = map.size;
  }

  // 2) حقول السلع المستوردة الناقصة (اسم/وصف/تصنيف عربي).
  const rows = await listProductsNeedingArabic(opts.productMax ?? 100);
  for (const r of rows) {
    if (!r.name_ar && r.name) { const ar = await translateToArabicCached(r.name); if (ar) { await setCjProductNameAr(r.id, ar); out.productNames++; } }
    if ((!r.display_description_ar) && r.source_description) { const ar = await translateToArabicCached(r.source_description); if (ar) { await setCjProductDescriptionAr(r.id, ar); out.productDescriptions++; } }
  }

  // 3) تعبئة صور وتفاصيل السلع الناقصة من CJ (معرض + متغيّرات/مواصفات).
  const missImg = await listProductsMissingImage(opts.imageMax ?? 20);
  for (const r of missImg) {
    const det = await getProduct(r.cj_product_id).catch(() => null);
    if (det && det.ok) {
      const gallery = [...new Set([det.data.productImage, ...(det.data.variants ?? []).map((v) => v.variantImage)].filter((s): s is string => !!s))];
      if (gallery.length) { await setCjProductGallery(r.id, gallery); out.images++; }
      await setCjProductDetails(r.id, buildCjDetails(det.data.variants ?? []));
    }
  }
  return out;
}
