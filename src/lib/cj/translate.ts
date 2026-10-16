import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/lib/settings';
import { glossaryExact, glossarySubstitute } from './glossary';

import {localTranslation,localServiceUrl,localSearchActive} from '@/lib/ai/local';

/** Local-only translation. Existing manual corrections and caches retain precedence. */
export const DEFAULT_LIBRETRANSLATE_URL='http://libretranslate:5000';
async function translationProviders():Promise<{libreUrl:string;libreKey:string}> {
 const raw=await getSetting('cj_libretranslate_url',process.env.LIBRETRANSLATE_URL||DEFAULT_LIBRETRANSLATE_URL).catch(()=>DEFAULT_LIBRETRANSLATE_URL);
 return {libreUrl:localServiceUrl(raw,'libretranslate')||'',libreKey:await getSetting('cj_libretranslate_key','').catch(()=>'')};
}

const TIMEOUT_MS = 9000;
const TRANSLATION_BUDGET_MS = 25000;
const MAX_LEN = 480; // حجم دفعة محلية بالبايت للحفاظ على النص كاملاً.
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
    const res = await fetch(url, { ...init, signal: controller.signal, redirect:'error', headers: { 'User-Agent': 'Trbhh-local-translation', ...(init.headers || {}) } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** المزوّد الأساسي: LibreTranslate الذاتي على الخادم (بلا إنترنت/اشتراك/حصّة). */
async function viaLibreTranslate(text: string, deadline: number): Promise<string | null> {
  const { libreUrl, libreKey } = await translationProviders();
  if (!libreUrl) return null;
  const body = (await fetchJson(`${libreUrl}/translate`, deadline, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: 'ar', format: 'text', ...(libreKey ? { api_key: libreKey } : {}) }),
  })) as { translatedText?: string } | null;
  const raw = body?.translatedText;
  const t = typeof raw === 'string' ? raw.trim() : '';
  return validOutput(t) ? t : null;
}

/** Local model returns structured translation; no external provider fallback. */
async function viaLocal(text:string,deadline:number, background=false):Promise<string|null> {
 const remaining=deadline-Date.now();if(remaining<=0)return null;
 const translated=await localTranslation(text,'ar',Math.min(background?45_000:TIMEOUT_MS,remaining),background?{priority:'background'}:undefined);
 return translated&&validOutput(translated)?translated:null;
}

const looksEnglish = (t: string) => !!t && /\p{Script=Latin}/u.test(t) && !/\p{Script=Arabic}/u.test(t) && t.length <= 100;
/**
 * ينظّف ناتج الترجمة قبل إرساله إلى بحث CJ: يزيل أدوات التعريف (a/an/the) وعلامات
 * الاقتباس والترقيم المحيطة، ويوحّد المسافات. «A screen» → «screen». يعيد null إن لم
 * يبقَ مصطلح إنجليزي صالح.
 */
function cleanEnglishTerm(raw: string): string | null {
  const c = String(raw || '')
    .trim()
    .replace(/^[\s"'“”‘’(){}\[\].,;:!?]+|[\s"'“”‘’(){}\[\].,;:!?]+$/g, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return looksEnglish(c) ? c : null;
}
/** توحيد عربي قبل الترجمة: إزالة التشكيل والتطويل والهمزات، وتوحيد أإآ→ا، ة→ه، ى→ي، ؤ→و، ئ→ي. */
export function normalizeArabicForSearch(value: string): string {
  return String(value || '')
    .replace(/[ً-ٰٟ]/g, '') // تشكيل
    .replace(/ـ/g, '')                      // تطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
export async function translateArabicToEnglish(text: string | null | undefined): Promise<string | null> {
  const raw = (text ?? '').trim().slice(0, 100);
  if (!raw) return '';
  if (!/\p{Script=Arabic}/u.test(raw)) return raw; // ليست عربية — تُستخدم كما هي
  // Normalize only for matching, never corrupt Arabic spelling sent to a model.
  const translated=await localTranslation(raw,'en',4500);
  return translated?cleanEnglishTerm(translated):null;
}

/** Full-source translation is all-or-nothing; a failed chunk cannot become a cached description. */
async function translateRaw(text: string, budgetMs = TRANSLATION_BUDGET_MS, background = false): Promise<string | null> {
  const deadline = Date.now() + budgetMs;
  // يطبّق المسرد (استبدال المصطلحات المعروفة بالعربية) قبل الترجمة الآلية؛ إن أصبح
  // النص كله عربياً بفضل المسرد فلا حاجة لنداء المترجم.
  const prepared = background ? text : await glossarySubstitute(text);
  if (isArabicText(prepared)) return prepared;
  const chunks = sourceChunks(prepared);
  if (!chunks?.length) return null;
  const translated: string[] = [];
  for (const chunk of chunks) {
    if (background && localSearchActive()) return null;
    if (Date.now() >= deadline) return null;
    await throttle();
    if (Date.now() >= deadline) return null;
    const result = (await viaLocal(chunk, deadline, background)) ?? (background ? null : await viaLibreTranslate(chunk, deadline));
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
  // مطابقة تامّة في المسرد للحقول القصيرة (ألوان/مقاسات/خيارات) قبل نداء المترجم.
  const exact = await glossaryExact(src);
  if (exact) return exact;
  return translateRaw(src);
}

/* ---------- ترجمة مخزَّنة (cache) لتفادي تكرار الطلبات ---------- */

function keyOf(src: string): string {
  // Keep exact legacy short/manual keys. Long legacy keys identified only a
  // prefix, so leave those rows intact but never reuse them for ambiguous text.
  return createHash('sha1').update((src.length <= MAX_LEN ? 'en:ar:' : 'en:ar:full-v2:') + src).digest('hex');
}
const automaticKeyOf = (src: string) => createHash('sha1').update('en:ar:auto-v3:' + src).digest('hex');

/** يقرأ ترجمات مخزَّنة لمجموعة نصوص دفعةً واحدة (بلا شبكة). يعيد خريطة نص→عربي. */
export async function getCachedArabic(texts: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !isArabicText(t)))];
  if (!clean.length) return out;
  const keys = clean.flatMap(src => [keyOf(src), automaticKeyOf(src)]);
  try {
    const rows = await prisma.cj_translations.findMany({ where: { source_key: { in: keys } }, select: { source_key: true, target_ar: true } });
    const saved = new Map(rows.map(row => [row.source_key, row.target_ar]));
    for (const src of clean) {
      // Existing valid/manual corrections always win, including a correction
      // written concurrently with an automatic translation.
      const original = saved.get(keyOf(src)), automatic = saved.get(automaticKeyOf(src));
      if (isArabicText(original)) out.set(src, original!);
      else if (isArabicText(automatic)) out.set(src, automatic!);
    }
  } catch { /* المخزن غير جاهز */ }
  return out;
}

async function saveAutomaticTranslation(src: string, arabic: string): Promise<string | null> {
  const key = automaticKeyOf(src);
  try {
    await prisma.cj_translations.upsert({ where: { source_key: key }, create: { source_key: key, target_ar: arabic }, update: {} });
  } catch { return null; }
  // A provider response is not proof that the result became available to GET.
  return (await getCachedArabic([src])).get(src) ?? null;
}

/** ترجمة نص مع تخزين النتيجة. يعيد العربية أو null. */
export async function translateToArabicCached(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (isArabicText(src)) return src;
  const hit = (await getCachedArabic([src])).get(src);
  if (hit) return hit;
  const ar = await translateToArabic(src);
  return ar ? saveAutomaticTranslation(src, ar) : null;
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
 *  ينفّذ المفقود بالتتابع حتى لا تتراكم طلبات النموذج المحلي. */
export async function translateManyCached(texts: (string | null | undefined)[], max = 30): Promise<Map<string, string>> {
  const map = await getCachedArabic(texts);
  const candidates = [...new Set(texts.map((t) => (t ?? '').trim()).filter((t) => t && !isArabicText(t) && !map.has(t)))];
  // مطابقة تامّة في المسرد أولاً (محلية، بلا مترجم) لكل الحقول القصيرة.
  const missing: string[] = [];
  for (const src of candidates) {
    const exact = await glossaryExact(src);
    if (exact) { const saved = await saveAutomaticTranslation(src, exact); if (saved) { map.set(src, saved); continue; } }
    missing.push(src);
  }
  const limited = missing.slice(0, Math.max(0, Math.floor(max)));
  const CONCURRENCY = 1;
  for (let i = 0; i < limited.length; i += CONCURRENCY) {
    const batch = limited.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (src) => [src, await translateRaw(src)] as const));
    let batchWins = 0;
    for (const [src, ar] of results) {
      if (ar) {
        const saved = await saveAutomaticTranslation(src, ar);
        if (saved) { batchWins++; map.set(src, saved); }
      }
    }
    // قاطع دائرة: دفعة كاملة بلا نجاح تعني المزوّد غير متاح/تجاوز الحصة — نتوقف
    // حتى لا يتعطّل تحميل الصفحة بمحاولات فاشلة متتالية.
    if (batchWins === 0) break;
  }
  return map;
}

/* ---------- ترجمة عرض متساهلة (تقبل أي ناتج فيه عربية ذات معنى) ----------
 * عناوين منتجات CJ تسويقية طويلة تبقى فيها أسماء ماركات/مصطلحات إنجليزية (3D/WiFi/LED/
 * اسم العلامة)، فيرفضها الفحص الصارم isArabicText فتظهر إنجليزية بالكامل. للعرض فقط نقبل
 * أي ترجمة فيها عربية حقيقية (≥ حرفين) ولو بقيت بعض الكلمات الإنجليزية — أفضل من الإنجليزية
 * الكاملة. تُخزَّن بمفتاح عرض مستقل حتى لا تختلط بالمخزَّن الصارم المستخدم في مواضع الجودة.
 */
const displayKeyOf = (src: string) => createHash('sha1').update('en:ar:disp-v1:' + src).digest('hex');

/** Background preparation writes only the automatic translation cache. */
export async function prepareArabicTranslation(src: string, budgetMs = 50_000): Promise<string | null> {
  if (!src || Buffer.byteLength(src, 'utf8') > MAX_SOURCE_BYTES) return null;
  const hit = (await getCachedArabic([src])).get(src);
  if (hit) return hit;
  const translated = await translateRaw(src, Math.min(50_000, Math.max(0, budgetMs)), true);
  return translated ? saveAutomaticTranslation(src, translated) : null;
}

/** Display reads saved translations and queues missing text without inference. */
export async function translateToArabicForDisplay(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (isArabicText(src)) return src;
  return (await translateManyForDisplay([src], 1)).get(src) ?? null;
}

export async function translateManyForDisplay(texts: (string | null | undefined)[], max = 40): Promise<Map<string, string>> {
  const clean = [...new Set(texts.slice(0, 100).map(t => (t ?? '').trim()).filter(t => t && Buffer.byteLength(t, 'utf8') <= MAX_SOURCE_BYTES && !isArabicText(t)))];
  const map = await getCachedArabic(clean);
  const missing = clean.filter(s => !map.has(s));
  if (missing.length) {
    try {
      const rows = await prisma.cj_translations.findMany({ where: { source_key: { in: missing.map(displayKeyOf) } }, select: { source_key: true, target_ar: true } });
      const saved = new Map(rows.map(row => [row.source_key, row.target_ar]));
      for (const text of missing) { const value = saved.get(displayKeyOf(text)); if (value && validOutput(value)) map.set(text, value); }
    } catch { /* Cache unavailable: retain original source. */ }
    const { enqueueArabicTranslations } = await import('./translation-queue');
    await enqueueArabicTranslations(missing.filter(s => !map.has(s)).slice(0, Number.isFinite(max) ? Math.max(0, Math.min(100, Math.floor(max))) : 0));
  }
  return map;
}
