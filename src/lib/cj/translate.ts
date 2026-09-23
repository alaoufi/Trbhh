import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * ترجمة آلية إلى العربية لمحتوى سلع/تصنيفات CJ (قراءة فقط، لا تمسّ بيانات دفع).
 * المزوّد الأساسي MyMemory (مجاني، مصمّم للاستخدام البرمجي، يُرجع JSON نظيفاً)،
 * مع محاولة احتياطية عبر نقطة Google المجانية إن فشل. أي فشل/تجاوز حصة → null
 * فيبقى النص كما هو ويستطيع المشرف تحريره يدوياً — لا تُوقِف الاستيراد أبداً.
 *
 * لرفع الحصة اليومية المجانية: اضبط MYMEMORY_EMAIL في بيئة الخادم (اختياري).
 */

const TIMEOUT_MS = 9000;
const MAX_LEN = 480; // حدّ MyMemory ~500 بايت للطلب الواحد
const MIN_GAP_MS = 300;

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

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', ...(init.headers || {}) } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** المزوّد الأساسي: MyMemory. */
async function viaMyMemory(text: string): Promise<string | null> {
  const email = process.env.MYMEMORY_EMAIL?.trim();
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar${email ? `&de=${encodeURIComponent(email)}` : ''}`;
  const body = (await fetchJson(url)) as { responseStatus?: number; quotaFinished?: boolean; responseData?: { translatedText?: string } } | null;
  if (!body || body.responseStatus !== 200 || body.quotaFinished) return null;
  const t = (body.responseData?.translatedText ?? '').trim();
  if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (EMAIL|LANGUAGE)/i.test(t)) return null;
  return t;
}

/** احتياطي: نقطة Google المجانية (قد تُحجب على بعض الشبكات). */
async function viaGoogle(text: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
  const body = await fetchJson(url);
  if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
  const out = (body[0] as unknown[]).map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('').trim();
  return out || null;
}

/** ترجمة خام بلا تنظيم معدّل (للدُفعات المتوازية). */
async function translateRaw(text: string): Promise<string | null> {
  return (await viaMyMemory(text)) ?? (await viaGoogle(text));
}

/** يترجم نصاً إنجليزياً إلى العربية. يُعيد null عند الفشل أو النص الفارغ. */
export async function translateToArabic(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (arabic.test(src)) return src; // معرّب أصلاً
  await throttle();
  return translateRaw(src.slice(0, MAX_LEN));
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
  } catch { /* المخزن غير جاهز */ }
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

/** «تعلّم الترجمة»: يحفظ تصحيح المشرف (نص المصدر → العربية الصحيحة) ويستبدل أي ترجمة
 *  سابقة، فيُعاد استخدامه تلقائياً في السلع المشابهة لاحقاً. */
export async function learnTranslation(source: string | null | undefined, arabic: string | null | undefined): Promise<void> {
  const s = (source ?? '').trim(); const a = (arabic ?? '').trim();
  if (!s || !a) return;
  const key = keyOf(s);
  await prisma.cj_translations.upsert({ where: { source_key: key }, create: { source_key: key, target_ar: a }, update: { target_ar: a } }).catch(() => {});
}

/** يترجم قائمة نصوص (المفقود منها فقط) ويخزّنها؛ يعيد خريطة نص→عربي شاملة المخزَّن.
 *  ينفّذ المفقود على دفعات متوازية محدودة لتقليل زمن الانتظار. */
export async function translateManyCached(texts: (string | null | undefined)[], max = 30): Promise<Map<string, string>> {
  const map = await getCachedArabic(texts);
  const missing = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !arabic.test(t) && !map.has(t)))].slice(0, max);
  const CONCURRENCY = 5;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (src) => [src, await translateRaw(src.slice(0, MAX_LEN))] as const));
    let batchWins = 0;
    for (const [src, ar] of results) {
      if (ar) { batchWins++; map.set(src, ar); await prisma.cj_translations.upsert({ where: { source_key: keyOf(src) }, create: { source_key: keyOf(src), target_ar: ar }, update: {} }).catch(() => {}); }
    }
    // قاطع دائرة: دفعة كاملة بلا نجاح تعني المزوّد غير متاح/تجاوز الحصة — نتوقف
    // حتى لا يتعطّل تحميل الصفحة بمحاولات فاشلة متتالية.
    if (batchWins === 0) break;
  }
  return map;
}
