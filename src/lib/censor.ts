import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensureTable = ensureSchema;

let cache: { list: string[]; re: RegExp | null; exp: number } = { list: [], re: null, exp: 0 };

function buildRegex(words: string[]): RegExp | null {
  // كل حرف مفصول بفاصل اختياري بين حروف الكلمة — يكشف التحايل بإدخال مسافات/نقاط
  // بين الحروف (مثل "س ك س" أو "s.e.x") الذي يفلت من مطابقة الكلمة الحرفية.
  const cleaned = words
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => [...w].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]*'));
  if (!cleaned.length) return null;
  // whole-word only: not preceded/followed by a letter or number
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${cleaned.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  } catch {
    return null;
  }
}

/** Load the banned-words list (cached ~60s). Call before censorSync. */
export async function loadBanned(): Promise<void> {
  if (Date.now() < cache.exp && cache.list.length >= 0) return;
  try {
    await ensureTable();
    const rows = await prisma.banned_words.findMany({ select: { word: true } });
    const list = rows.map((r) => r.word).filter(Boolean);
    cache = { list, re: buildRegex(list), exp: Date.now() + 60_000 };
  } catch {
    cache = { list: [], re: null, exp: Date.now() + 60_000 };
  }
}

/** Redact whole banned words with black blocks. Requires loadBanned() first. */
export function censorSync(text: string | null | undefined): string {
  if (!text) return text ?? '';
  if (!cache.re) return text;
  return text.replace(cache.re, (m) => '█'.repeat(Math.max(3, [...m].length)));
}

/** Convenience: load + censor a single string. */
export async function censor(text: string | null | undefined): Promise<string> {
  await loadBanned();
  return censorSync(text);
}

/* ---- قائمة الأسماء الممنوعة (كلمات وجمل) — مستقلة عن حجب المحتوى ----
   الجملة تُمنع مجتمعةً فقط: «الملك سلمان» ممنوعة بينما «سلمان» وحدها مقبولة
   (المطابقة كلمة/جملة كاملة عبر نفس آلية بناء التعبير). */
let nameCache: { list: string[]; re: RegExp | null; exp: number } = { list: [], re: null, exp: 0 };

async function loadNameBanned(): Promise<void> {
  if (Date.now() < nameCache.exp) return;
  try {
    await ensureTable();
    const rows = await prisma.name_words.findMany({ select: { word: true } });
    const list = rows.map((r) => r.word).filter(Boolean);
    nameCache = { list, re: buildRegex(list), exp: Date.now() + 60_000 };
  } catch {
    nameCache = { list: [], re: null, exp: Date.now() + 60_000 };
  }
}

/**
 * فحص اسم عضو/متجر: يرفض إن طابق قائمة الأسماء الممنوعة أو قائمة الكلمات
 * المرفوضة العامة (المسيئة). تُعيد أول مطابقة أو null.
 */
export async function containsBannedName(text: string | null | undefined): Promise<string | null> {
  if (!text) return null;
  await Promise.all([loadBanned(), loadNameBanned()]);
  for (const re of [nameCache.re, cache.re]) {
    if (!re) continue;
    re.lastIndex = 0;
    const m = re.exec(text);
    re.lastIndex = 0;
    if (m) return m[0];
  }
  return null;
}

export async function getNameWords(): Promise<{ id: number; word: string }[]> {
  await ensureTable();
  const rows = await prisma.name_words.findMany({ orderBy: { id: 'desc' } }).catch(() => []);
  return rows.map((r) => ({ id: r.id, word: r.word }));
}

export async function addNameWord(word: string) {
  await ensureTable();
  const w = word.trim().slice(0, 120);
  if (!w) return;
  await prisma.name_words.create({ data: { word: w } }).catch(() => {});
  nameCache.exp = 0;
}

export async function deleteNameWord(id: number) {
  await ensureTable();
  await prisma.name_words.delete({ where: { id } }).catch(() => {});
  nameCache.exp = 0;
}

/**
 * هل يحتوي النص كلمة/جملة من قائمة المرفوضات؟ تُعيد أول مطابقة أو null.
 * تُستخدم لرفض أسماء الأعضاء والمتاجر المخالفة (الفحص على مسارات الأعضاء فقط،
 * فالإدارة وحدها تستطيع اعتماد اسم مخالف من لوحتها إن أرادت).
 */
export async function containsBanned(text: string | null | undefined): Promise<string | null> {
  if (!text) return null;
  await loadBanned();
  if (!cache.re) return null;
  cache.re.lastIndex = 0;
  const m = cache.re.exec(text);
  cache.re.lastIndex = 0;
  return m ? m[0] : null;
}

export async function getBannedWords(): Promise<{ id: number; word: string }[]> {
  await ensureTable();
  const rows = await prisma.banned_words.findMany({ orderBy: { id: 'desc' } });
  return rows.map((r) => ({ id: Number(r.id), word: r.word }));
}

export async function addBannedWord(word: string) {
  await ensureTable();
  const w = word.trim().slice(0, 100);
  if (!w) return;
  await prisma.banned_words.create({ data: { word: w } });
  cache.exp = 0; // invalidate
}

export async function deleteBannedWord(id: number) {
  await ensureTable();
  await prisma.banned_words.deleteMany({ where: { id: BigInt(id) } });
  cache.exp = 0;
}
