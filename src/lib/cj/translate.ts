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
const TRANSLATION_BUDGET_MS = 25000;
const MAX_LEN = 480; // حدّ MyMemory بالبايت، وليس عدد محارف JavaScript.
const MAX_SOURCE_BYTES = 20000;
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

const technicalToken = /^(?:USB(?:-?C)?|HDMI|LED|LCD|OLED|Wi-?Fi|Bluetooth|GPS|NFC|XXS|XS|S|M|L|[2-6]?XL|XXL|XXXL|[A-Z]{1,5}\d[\w.-]*|\d+(?:GB|TB|MB|GHz|MHz|Hz|V|W|mm|cm|kg))$/i;
const plainText = (value: string) => value.replace(/<[^>]*>/g, '');
function meaningfulArabic(value: string): boolean {
  return (plainText(value).match(/(?=\p{Letter})\p{Script=Arabic}/gu)?.length ?? 0) >= 2;
}
/** Arabic display may retain a model, unit, size or isolated brand; English prose still needs translation. */
export function isArabicText(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const plain = plainText(value).trim();
  if (technicalToken.test(plain)) return true;
  if (!meaningfulArabic(plain)) return false;
  const runs = plain.match(/\p{Script=Latin}[\p{Script=Latin}\p{Number}._+-]*(?:[ \t]+\p{Script=Latin}[\p{Script=Latin}\p{Number}._+-]*)*/gu) ?? [];
  let brands = 0;
  for (const run of runs) {
    const words = run.split(/[ \t]+/).filter(word => !technicalToken.test(word));
    // A lone capitalized brand is not an untranslated sentence. Product IDs
    // remain separate fields; this does not invent a translation for prose.
    if (words.length > 1 || words.some(word => !/^[A-Z]/.test(word))) return false;
    brands += words.length;
  }
  return brands <= 3;
}

const validOutput = (value: string) => meaningfulArabic(value) && isArabicText(value);

/** Preserve every source character; prefer word boundaries and never split a code point. */
function sourceChunks(source: string): string[] | null {
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return null;
  const chunks: string[] = [];
  let chunk = '';
  for (const token of source.match(/\S+\s*|\s+/gu) ?? []) {
    if (Buffer.byteLength(chunk + token, 'utf8') <= MAX_LEN) { chunk += token; continue; }
    if (chunk) { chunks.push(chunk); chunk = ''; }
    for (const character of token) {
      if (Buffer.byteLength(chunk + character, 'utf8') > MAX_LEN) { chunks.push(chunk); chunk = ''; }
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

async function fetchJson(url: string, deadline: number, init: RequestInit = {}): Promise<unknown | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, remaining));
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
async function viaMyMemory(text: string, deadline: number): Promise<string | null> {
  const email = process.env.MYMEMORY_EMAIL?.trim();
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar${email ? `&de=${encodeURIComponent(email)}` : ''}`;
  const body = (await fetchJson(url, deadline)) as { responseStatus?: number; quotaFinished?: boolean; responseData?: { translatedText?: string } } | null;
  if (!body || body.responseStatus !== 200 || body.quotaFinished) return null;
  const raw = body.responseData?.translatedText;
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!validOutput(t) || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (EMAIL|LANGUAGE)/i.test(t)) return null;
  return t;
}

/** احتياطي: نقطة Google المجانية (قد تُحجب على بعض الشبكات). */
async function viaGoogle(text: string, deadline: number): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
  const body = await fetchJson(url, deadline);
  if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
  const out = (body[0] as unknown[]).map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('').trim();
  return validOutput(out) ? out : null;
}

/** Full-source translation is all-or-nothing; a failed chunk cannot become a cached description. */
async function translateRaw(text: string): Promise<string | null> {
  const deadline = Date.now() + TRANSLATION_BUDGET_MS;
  const chunks = sourceChunks(text);
  if (!chunks?.length) return null;
  const translated: string[] = [];
  for (const chunk of chunks) {
    if (Date.now() >= deadline) return null;
    await throttle();
    if (Date.now() >= deadline) return null;
    const result = (await viaMyMemory(chunk, deadline)) ?? (await viaGoogle(chunk, deadline));
    if (!result || Date.now() >= deadline) return null;
    translated.push(result);
  }
  return translated.join('\n');
}

/** يترجم نصاً إنجليزياً إلى العربية. يُعيد null عند الفشل أو النص الفارغ. */
export async function translateToArabic(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (isArabicText(src)) return src;
  return translateRaw(src);
}

/* ---------- ترجمة مخزَّنة (cache) لتفادي تكرار الطلبات ---------- */

function keyOf(src: string): string {
  // Keep exact legacy short/manual keys. Long legacy keys identified only a
  // prefix, so leave those rows intact but never reuse them for ambiguous text.
  return createHash('sha1').update((src.length <= MAX_LEN ? 'en:ar:' : 'en:ar:full-v2:') + src).digest('hex');
}

/** يقرأ ترجمات مخزَّنة لمجموعة نصوص دفعةً واحدة (بلا شبكة). يعيد خريطة نص→عربي. */
export async function getCachedArabic(texts: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !isArabicText(t)))];
  if (!clean.length) return out;
  const byKey = new Map(clean.map((t) => [keyOf(t), t]));
  try {
    const rows = await prisma.cj_translations.findMany({ where: { source_key: { in: [...byKey.keys()] } }, select: { source_key: true, target_ar: true } });
    for (const r of rows) { const src = byKey.get(r.source_key); if (src && isArabicText(r.target_ar)) out.set(src, r.target_ar); }
  } catch { /* المخزن غير جاهز */ }
  return out;
}

/** ترجمة نص مع تخزين النتيجة. يعيد العربية أو null. */
export async function translateToArabicCached(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (isArabicText(src)) return src;
  const key = keyOf(src);
  try {
    const hit = await prisma.cj_translations.findUnique({ where: { source_key: key }, select: { target_ar: true } });
    if (isArabicText(hit?.target_ar)) return hit!.target_ar;
  } catch { /* تجاهل */ }
  const ar = await translateToArabic(src);
  if (ar) await prisma.cj_translations.upsert({ where: { source_key: key }, create: { source_key: key, target_ar: ar }, update: {} }).catch(() => {});
  return ar;
}

/** «تعلّم الترجمة»: يحفظ تصحيح المشرف (نص المصدر → العربية الصحيحة) ويستبدل أي ترجمة
 *  سابقة، فيُعاد استخدامه تلقائياً في السلع المشابهة لاحقاً. */
export async function learnTranslation(source: string | null | undefined, arabic: string | null | undefined): Promise<void> {
  const s = (source ?? '').trim(); const a = (arabic ?? '').trim();
  if (!s || !validOutput(a) || Buffer.byteLength(s, 'utf8') > MAX_SOURCE_BYTES || Buffer.byteLength(a, 'utf8') > MAX_SOURCE_BYTES) return;
  const key = keyOf(s);
  await prisma.cj_translations.upsert({ where: { source_key: key }, create: { source_key: key, target_ar: a }, update: { target_ar: a } }).catch(() => {});
}

/** يترجم قائمة نصوص (المفقود منها فقط) ويخزّنها؛ يعيد خريطة نص→عربي شاملة المخزَّن.
 *  ينفّذ المفقود على دفعات متوازية محدودة لتقليل زمن الانتظار. */
export async function translateManyCached(texts: (string | null | undefined)[], max = 30): Promise<Map<string, string>> {
  const map = await getCachedArabic(texts);
  const missing = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !isArabicText(t) && !map.has(t)))].slice(0, Math.max(0, Math.floor(max)));
  const CONCURRENCY = 5;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (src) => [src, await translateRaw(src)] as const));
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
