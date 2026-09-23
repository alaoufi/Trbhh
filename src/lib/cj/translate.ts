import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * ترجمة آلية إلى العربية لمحتوى سلع CJ (الاسم/الوصف). تستخدم نقطة ترجمة Google
 * المجانية (بلا مفتاح) مع مهلة وتسلسل خفيف. عند أي فشل تُعيد null فيبقى النص كما هو
 * ويستطيع المشرف تحريره يدوياً — لا تُوقِف الاستيراد أبداً.
 *
 * قراءة فقط لخدمة الترجمة؛ لا تمسّ CJ ولا أي بيانات دفع.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TIMEOUT_MS = 8000;
const MAX_LEN = 1200; // سقف طول الإدخال (أسماء/أوصاف قصيرة)
const MIN_GAP_MS = 350; // تباعد خفيف بين الطلبات

let lastAt = 0;
let gate: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  return gate;
}

const arabic = /[؀-ۿ]/;

/** يترجم نصاً إنجليزياً إلى العربية. يُعيد null عند الفشل أو النص الفارغ. */
export async function translateToArabic(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (arabic.test(src)) return src; // معرّب أصلاً — لا تُهدر طلباً
  const clipped = src.slice(0, MAX_LEN);
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(clipped)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    // الشكل: [[["ترجمة","الأصل",...], ...], ...]
    if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
    const out = (body[0] as unknown[])
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('')
      .trim();
    return out || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- ترجمة مخزَّنة (cache) لتفادي تكرار الطلبات ---------- */

function keyOf(src: string): string {
  return createHash('sha1').update('en:ar:' + src.slice(0, MAX_LEN)).digest('hex');
}

/** يقرأ ترجمات مخزَّنة لمجموعة نصوص دفعةً واحدة (بلا شبكة). يعيد خريطة نص→عربي. */
export async function getCachedArabic(texts: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !arabic.test(t)))];
  if (!clean.length) return out;
  const byKey = new Map(clean.map((t) => [keyOf(t), t]));
  try {
    const rows = await prisma.cj_translations.findMany({ where: { source_key: { in: [...byKey.keys()] } }, select: { source_key: true, target_ar: true } });
    for (const r of rows) { const src = byKey.get(r.source_key); if (src) out.set(src, r.target_ar); }
  } catch { /* المخزن غير جاهز — لا شيء مخزَّن */ }
  return out;
}

/** ترجمة نص مع تخزين النتيجة. يعيد العربية أو null. */
export async function translateToArabicCached(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (arabic.test(src)) return src;
  const key = keyOf(src);
  try {
    const hit = await prisma.cj_translations.findUnique({ where: { source_key: key }, select: { target_ar: true } });
    if (hit?.target_ar) return hit.target_ar;
  } catch { /* تجاهل */ }
  const ar = await translateToArabic(src);
  if (ar) await prisma.cj_translations.upsert({ where: { source_key: key }, create: { source_key: key, target_ar: ar }, update: {} }).catch(() => {});
  return ar;
}

/** يترجم قائمة نصوص (المفقود منها فقط) ويخزّنها؛ يعيد خريطة نص→عربي شاملة المخزَّن. */
export async function translateManyCached(texts: (string | null | undefined)[], max = 30): Promise<Map<string, string>> {
  const map = await getCachedArabic(texts);
  const missing = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !arabic.test(t) && !map.has(t)))].slice(0, max);
  for (const src of missing) {
    const ar = await translateToArabic(src);
    if (ar) { map.set(src, ar); await prisma.cj_translations.upsert({ where: { source_key: keyOf(src) }, create: { source_key: keyOf(src), target_ar: ar }, update: {} }).catch(() => {}); }
  }
  return map;
}
