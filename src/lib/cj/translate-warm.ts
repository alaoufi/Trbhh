import 'server-only';
import { getCategories } from './client';
import { translateManyCached, translateToArabicCached } from './translate';
import { listProductsNeedingArabic, setCjProductNameAr, setCjProductDescriptionAr } from './mapping';

/**
 * تهيئة (warming) الترجمات على الخادم — تُشغَّل أسبوعياً (كرون داخلي) أو يدوياً.
 * تترجم شجرة تصنيفات CJ وحقول السلع المستوردة الناقصة (اسم/وصف/تصنيف) وتخزّنها في
 * قاعدة البيانات (cj_translations + cj_products) — فيصبح التصفّح سريعاً (من المخزَّن)
 * وآمناً (دفعة متحكّم بها لا طلبات حيّة عند كل تحميل). idempotent: المترجَم مسبقاً يُتجاوز.
 */
export type WarmResult = { categories: number; productNames: number; productDescriptions: number };

export async function warmCjTranslations(opts: { categoryMax?: number; productMax?: number } = {}): Promise<WarmResult> {
  const out: WarmResult = { categories: 0, productNames: 0, productDescriptions: 0 };

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
  return out;
}
