import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * مُسرد مصطلحات التجارة/المنتجات (محلي بالكامل، بلا إنترنت) يُطبَّق قبل الترجمة الآلية:
 *  - مطابقة تامّة (exact): للحقول القصيرة (أسماء الخيارات/الألوان/المقاسات/المواصفات)
 *    فيُعاد المقابل العربي الثابت فوراً بلا نداء المترجم.
 *  - استبدال داخل النص (substitute): يستبدل المصطلح الإنجليزي كلمةً كلمةً بمقابله
 *    العربي في العنوان/الوصف قبل إرساله للمترجم المحلي، فيَفرض المصطلحية الصحيحة.
 * المصدر الوحيد للمسرد هو جدول cj_glossary (محرَّر من لوحة الإدارة). تُبذَر مصطلحات
 * شائعة تلقائياً عند الإقلاع إن كان الجدول فارغاً، ويبقى كله قابلاً للتعديل.
 */

export type GlossaryEntry = { source: string; target_ar: string; whole_text: boolean };

/** توحيد المصدر: حروف صغيرة + مسافات موحّدة + إزالة الأطراف (مفتاح المطابقة التامّة). */
export function normalizeGlossaryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

type GlossaryCache = { at: number; exact: Map<string, string>; substitutions: { term: string; re: RegExp; target: string }[] };
let cache: GlossaryCache | null = null;
let seedAttempted = false;
const CACHE_MS = 60_000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** مصطلح صالح للاستبدال داخل النص: ASCII، ٣ أحرف فأكثر، يبدأ/ينتهي بحرف أو رقم
 *  (حتى تعمل حدود الكلمة \b بأمان ولا نستبدل أجزاء كلمات أو أحرفاً مفردة). */
function substitutable(source: string): boolean {
  return /^[\x20-\x7E]{3,}$/.test(source) && /[A-Za-z0-9]$/.test(source) && /^[A-Za-z0-9]/.test(source);
}

async function load(): Promise<GlossaryCache> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const exact = new Map<string, string>();
  const subs: { term: string; re: RegExp; target: string }[] = [];
  try {
    let rows = await prisma.cj_glossary.findMany({
      where: { enabled: 1 },
      select: { src_norm: true, source: true, target_ar: true, whole_text: true },
    });
    // بذرة أوّلية مرّة واحدة لكل عملية إن كان الجدول فارغاً تماماً، لتعمل الترجمة
    // محلياً بمصطلحات شائعة دون أي ضبط يدوي (قابلة للتعديل/الحذف لاحقاً).
    if (!rows.length && !seedAttempted) {
      seedAttempted = true;
      if (await seedDefaultGlossary() > 0) {
        rows = await prisma.cj_glossary.findMany({ where: { enabled: 1 }, select: { src_norm: true, source: true, target_ar: true, whole_text: true } });
      }
    }
    for (const row of rows) {
      const target = (row.target_ar || '').trim();
      if (!target) continue;
      if (row.src_norm) exact.set(row.src_norm, target);
      if (!row.whole_text && substitutable(row.source)) {
        subs.push({ term: row.source, re: new RegExp(`\\b${escapeRegExp(row.source)}\\b`, 'gi'), target });
      }
    }
  } catch { /* الجدول غير جاهز — مسرد فارغ */ }
  // أطول المصطلحات أولاً حتى لا يلتهم مصطلح قصير جزءاً من آخر أطول.
  subs.sort((a, b) => b.term.length - a.term.length);
  cache = { at: Date.now(), exact, substitutions: subs };
  return cache;
}

/** يُبطل ذاكرة المسرد فوراً بعد أي تعديل إداري. */
export function invalidateGlossaryCache(): void {
  cache = null;
}

/** مطابقة تامّة للحقل القصير بأكمله → المقابل العربي الثابت، أو null. */
export async function glossaryExact(source: string | null | undefined): Promise<string | null> {
  const key = normalizeGlossaryKey(source ?? '');
  if (!key) return null;
  const { exact } = await load();
  return exact.get(key) ?? null;
}

/** يستبدل المصطلحات المعروفة داخل النص بمقابلها العربي قبل الترجمة الآلية. */
export async function glossarySubstitute(source: string): Promise<string> {
  const { substitutions } = await load();
  if (!substitutions.length) return source;
  let out = source;
  for (const { re, target } of substitutions) out = out.replace(re, target);
  return out;
}

/* ---------- إدارة المسرد ---------- */

export async function listGlossary(): Promise<Array<{ id: string; source: string; target_ar: string; enabled: boolean; whole_text: boolean }>> {
  const rows = await prisma.cj_glossary.findMany({ orderBy: [{ source: 'asc' }], select: { id: true, source: true, target_ar: true, enabled: true, whole_text: true } }).catch(() => []);
  return rows.map((r) => ({ id: r.id.toString(), source: r.source, target_ar: r.target_ar, enabled: r.enabled === 1, whole_text: r.whole_text === 1 }));
}

/** إضافة/تعديل مصطلح (بالمصدر). المطابقة على src_norm لتفادي التكرار. */
export async function upsertGlossaryTerm(source: string, targetAr: string, opts: { wholeText?: boolean; enabled?: boolean } = {}): Promise<boolean> {
  const src = (source ?? '').trim();
  const target = (targetAr ?? '').trim();
  const srcNorm = normalizeGlossaryKey(src);
  if (!srcNorm || !target || src.length > 400 || target.length > 400) return false;
  const whole_text = opts.wholeText ? 1 : 0;
  const enabled = opts.enabled === false ? 0 : 1;
  try {
    await prisma.cj_glossary.upsert({
      where: { src_norm: srcNorm },
      create: { src_norm: srcNorm, source: src, target_ar: target, whole_text, enabled },
      update: { source: src, target_ar: target, whole_text, enabled },
    });
    invalidateGlossaryCache();
    return true;
  } catch { return false; }
}

export async function deleteGlossaryTerm(id: string): Promise<void> {
  const big = (() => { try { return BigInt(id); } catch { return null; } })();
  if (big === null) return;
  await prisma.cj_glossary.delete({ where: { id: big } }).catch(() => {});
  invalidateGlossaryCache();
}

/** مصطلحات تجارية شائعة تُبذَر تلقائياً إن كان الجدول فارغاً (قابلة للتعديل/الحذف لاحقاً). */
export const DEFAULT_GLOSSARY: Array<[string, string, boolean?]> = [
  // ألوان
  ['Red', 'أحمر', false], ['Blue', 'أزرق', false], ['Black', 'أسود', false], ['White', 'أبيض', false],
  ['Green', 'أخضر', false], ['Yellow', 'أصفر', false], ['Pink', 'وردي', false], ['Purple', 'بنفسجي', false],
  ['Orange', 'برتقالي', false], ['Gray', 'رمادي', false], ['Grey', 'رمادي', false], ['Brown', 'بني', false],
  ['Gold', 'ذهبي', false], ['Silver', 'فضي', false], ['Beige', 'بيج', false], ['Navy', 'كحلي', false],
  ['Khaki', 'كاكي', false], ['Rose Gold', 'ذهبي وردي', false], ['Dark Blue', 'أزرق غامق', false], ['Light Blue', 'أزرق فاتح', false],
  // مقاسات (كلمات، لا أحرف مفردة)
  ['Small', 'صغير', false], ['Medium', 'متوسط', false], ['Large', 'كبير', false],
  ['One Size', 'مقاس واحد', false], ['Free Size', 'مقاس حر', false],
  // خامات
  ['Cotton', 'قطن', false], ['Polyester', 'بوليستر', false], ['Leather', 'جلد', false], ['Genuine Leather', 'جلد طبيعي', false],
  ['Stainless Steel', 'ستانلس ستيل', false], ['Plastic', 'بلاستيك', false], ['Silicone', 'سيليكون', false],
  ['Wool', 'صوف', false], ['Nylon', 'نايلون', false], ['Rubber', 'مطاط', false], ['Glass', 'زجاج', false],
  ['Ceramic', 'سيراميك', false], ['Aluminum', 'ألمنيوم', false], ['Aluminium', 'ألمنيوم', false],
  // سمات شائعة
  ['Waterproof', 'مقاوم للماء', false], ['Wireless', 'لاسلكي', false], ['Rechargeable', 'قابل للشحن', false],
  ['Adjustable', 'قابل للتعديل', false], ['Portable', 'محمول', false], ['Foldable', 'قابل للطي', false],
  ['Non-slip', 'مانع للانزلاق', false], ['Reusable', 'قابل لإعادة الاستخدام', false],
  // مصطلحات حقول/عبوة
  ['Color', 'اللون', false], ['Colour', 'اللون', false], ['Size', 'المقاس', false], ['Material', 'الخامة', false],
  ['Weight', 'الوزن', false], ['Quantity', 'الكمية', false], ['Style', 'النمط', false], ['Model', 'الموديل', false],
  ['Package', 'العبوة', false], ['Package Includes', 'تشمل العبوة', false], ['Set', 'طقم', false], ['Pack', 'عبوة', false],
];

/** يبذر المصطلحات الافتراضية إن كان الجدول فارغاً (idempotent). */
export async function seedDefaultGlossary(): Promise<number> {
  try {
    const existing = await prisma.cj_glossary.count();
    if (existing > 0) return 0;
    let n = 0;
    for (const [source, target, whole] of DEFAULT_GLOSSARY) {
      if (await upsertGlossaryTerm(source, target, { wholeText: !!whole })) n++;
    }
    invalidateGlossaryCache();
    return n;
  } catch { return 0; }
}
