import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

export type GuardCategory = 'immoral' | 'drugs' | 'weapons' | 'political' | 'charity';
export const GUARD_CATEGORIES: GuardCategory[] = ['immoral', 'drugs', 'weapons', 'political', 'charity'];

export const CATEGORY_LABEL: Record<GuardCategory, string> = {
  immoral: 'محتوى غير أخلاقي',
  drugs: 'مخدرات أو مسكرات',
  weapons: 'أسلحة أو محتوى أمني',
  political: 'محتوى سياسي مشبوه',
  charity: 'جمع تبرعات أو نشاط جمعية غير مرخّص',
};

/** Normalize Arabic for robust matching (strip diacritics, unify letters). */
function normalize(s: string): string {
  return (s || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** نسخة "مضغوطة" بلا أي فراغات — تكشف تحايل التباعد بين الحروف (مثل
 *  "س ك س" أو "s e x") الذي يفلت من المطابقة العادية لأنها تحترم حدود
 *  الكلمات. تُستخدم كطبقة إضافية فوق المطابقة الأصلية، لا بديلاً عنها. */
function squash(s: string): string {
  return normalize(s).replace(/\s+/g, '');
}

/** Very explicit tokens matched even inside other words (safe substrings). */
const HARD: { sub: string; cat: GuardCategory }[] = [
  { sub: 'سكس', cat: 'immoral' }, { sub: 'سيكس', cat: 'immoral' }, { sub: 'اباحي', cat: 'immoral' },
  { sub: 'دعار', cat: 'immoral' }, { sub: 'شرموط', cat: 'immoral' }, { sub: 'عاهر', cat: 'immoral' },
  { sub: 'قحب', cat: 'immoral' }, { sub: 'نياك', cat: 'immoral' }, { sub: 'خول', cat: 'immoral' },
  { sub: 'porn', cat: 'immoral' }, { sub: 'xxx', cat: 'immoral' }, { sub: 'sexy', cat: 'immoral' },
  { sub: 'كبتاجون', cat: 'drugs' }, { sub: 'حشيش', cat: 'drugs' }, { sub: 'كوكاي', cat: 'drugs' },
  { sub: 'هيروين', cat: 'drugs' }, { sub: 'شبو', cat: 'drugs' },
];

/** Built-in whole-word / phrase terms per category (defaults). */
export const BUILTIN: Record<GuardCategory, string[]> = {
  immoral: [
    'جنس', 'جنسي', 'جنسيه', 'نيك', 'متعه', 'مساج جنسي', 'مساج مثير', 'تعري', 'عاري', 'عاريه',
    'بورن', 'sex', 'مثليه', 'شذوذ', 'لواط', 'سحاق', 'بنات للمتعه', 'مكالمات جنسيه', 'تعارف للكبار',
    'ليله حمراء', 'فيديو ساخن', 'صور فاضحه', 'بلا ملابس', 'رقص عاري', 'ديوث',
  ],
  drugs: [
    'مخدرات', 'مخدر', 'كريستال ميث', 'ترامادول', 'ليريكا', 'كوكايين', 'ماريجوانا', 'قرص مخدر',
    'حبوب مخدره', 'مواد مخدره', 'خمور', 'خمر', 'مسكر', 'مشروبات كحوليه', 'كحول', 'حبوب منومه للبيع',
  ],
  weapons: [
    'سلاح', 'اسلحه', 'مسدس', 'رشاش', 'بندقيه', 'ذخيره', 'ذخائر', 'متفجرات', 'قنبله', 'قنابل',
    'عبوه ناسفه', 'تفجير', 'داعش', 'القاعده', 'تنظيم ارهابي', 'مواد متفجره',
  ],
  political: [
    'اسقاط النظام', 'ضد الحكومه', 'ضد الدوله', 'ضد الحاكم', 'تحريض سياسي', 'مظاهره', 'تظاهر',
    'اعتصام سياسي', 'منشور سياسي', 'ضد ولي الامر', 'ضد الملك', 'انقلاب',
  ],
  // جمع التبرعات المالية باسم جمعية/صندوق خيري يتطلّب ترخيصاً رسمياً (المركز الوطني
  // لتنمية القطاع غير الربحي) — يُمنع نشره كإعلان تصنيفي عام دون ترخيص موثّق.
  charity: [
    'جمعيه خيريه', 'جمعية خيرية', 'جمع تبرعات', 'حملة تبرعات', 'صندوق خيري', 'وقف خيري',
    'تبرعوا الان', 'ادعموا الجمعيه', 'جمعية غير مرخصة', 'تبرع لجمعية', 'جمع زكاة', 'تحصيل تبرعات',
  ],
};

/* ---- custom (admin-editable) words ---- */
const ensure = ensureSchema;

let custom: Record<GuardCategory, string[]> = { immoral: [], drugs: [], weapons: [], political: [], charity: [] };
let loadedAt = 0;
async function loadGuardWords() {
  if (Date.now() - loadedAt < 60000) return; // 60s cache
  await ensure();
  const rows = await prisma.guard_words.findMany({ select: { category: true, word: true } }).catch(() => []);
  const next: Record<GuardCategory, string[]> = { immoral: [], drugs: [], weapons: [], political: [], charity: [] };
  for (const r of rows) if ((GUARD_CATEGORIES as string[]).includes(r.category)) next[r.category as GuardCategory].push(r.word);
  custom = next;
  loadedAt = Date.now();
}

/**
 * Scan free text for prohibited content. Returns the first matching category
 * (immoral first — strictest), or null when clean. Uses built-in + admin words.
 */
export async function scanContent(...parts: (string | null | undefined)[]): Promise<{ category: GuardCategory; term: string } | null> {
  await loadGuardWords().catch(() => {});
  const raw = parts.filter(Boolean).join(' ');
  const t = normalize(raw);
  if (!t) return null;
  const sq = squash(raw);
  for (const h of HARD) if (t.includes(h.sub) || sq.includes(h.sub)) return { category: h.cat, term: h.sub };
  const padded = ` ${t} `;
  for (const cat of GUARD_CATEGORIES) {
    for (const term of [...BUILTIN[cat], ...custom[cat]]) {
      const nt = normalize(term);
      if (!nt) continue;
      if (padded.includes(` ${nt} `)) return { category: cat, term };
      const sqTerm = nt.replace(/\s+/g, '');
      if (sqTerm.length >= 3 && sq.includes(sqTerm)) return { category: cat, term };
    }
  }
  return null;
}

/* ============================================================================
   التشفير بدل الإيقاف: بدل حجب الإعلان، تُبدَّل الكلمات الممنوعة بنجمات ويُنشر
   الإعلان «قيد المراجعة» مع إشعار العضو وتنبيه الإدارة. مع قائمة سماح للجُمل
   (مثل «وايت سكس») تُستثنى كاملةً بينما تُشفَّر الكلمة المفردة.
   ============================================================================ */

/* ---- قائمة السماح (جُمل مسموحة رغم احتوائها كلمة ممنوعة) ---- */
let allowCache: { list: string[]; exp: number } = { list: [], exp: 0 };
async function loadAllowed(): Promise<string[]> {
  if (Date.now() < allowCache.exp) return allowCache.list;
  await ensure();
  const rows = await prisma.allowed_phrases.findMany({ select: { phrase: true } }).catch(() => []);
  allowCache = { list: rows.map((r) => r.phrase).filter(Boolean), exp: Date.now() + 60000 };
  return allowCache.list;
}
export async function getAllowedPhrases(): Promise<{ id: number; phrase: string }[]> {
  await ensure();
  const rows = await prisma.allowed_phrases.findMany({ orderBy: { id: 'desc' } }).catch(() => []);
  return rows.map((r) => ({ id: Number(r.id), phrase: r.phrase }));
}
export async function addAllowedPhrase(phrase: string) {
  await ensure();
  // يقبل الجملة بين قوسين أو دونها — نجرّد الأقواس المحيطة ونحفظ الجملة كما هي
  const w = phrase.trim().replace(/^[([{（]+/, '').replace(/[)\]}）]+$/, '').trim().slice(0, 120);
  if (!w) return;
  await prisma.allowed_phrases.create({ data: { phrase: w } }).catch(() => {});
  allowCache.exp = 0;
}
export async function deleteAllowedPhrase(id: number) {
  await ensure();
  await prisma.allowed_phrases.deleteMany({ where: { id } }).catch(() => {});
  allowCache.exp = 0;
}

/* ---- بناء تعبير نمطي متسامح مع صيغ الحروف العربية والتباعد ---- */
const LETTER_VARIANTS: Record<string, string> = {
  'ا': 'اأإآ', 'أ': 'اأإآ', 'إ': 'اأإآ', 'آ': 'اأإآ', 'ي': 'يى', 'ى': 'يى', 'ه': 'هة', 'ة': 'هة',
};
function guardCharClass(ch: string): string {
  const v = LETTER_VARIANTS[ch];
  if (v) return `[${v}]`;
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** نمط للكلمة/الجملة: مسافات = فاصل واحد+، وبين حروف الكلمة فواصل اختيارية (كشف التحايل). */
function guardTermPattern(term: string): string {
  const chars = [...term.trim()];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ' ') { out += '[^\\p{L}\\p{N}]+'; continue; }
    if (i > 0 && chars[i - 1] !== ' ') out += '[^\\p{L}\\p{N}]*';
    out += guardCharClass(ch);
  }
  return out;
}
function makeRe(terms: string[], wholeWord: boolean): RegExp | null {
  const pats = terms.map((t) => t.trim()).filter(Boolean).map(guardTermPattern);
  if (!pats.length) return null;
  const body = `(?:${pats.join('|')})`;
  const src = wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
  try { return new RegExp(src, 'giu'); } catch { return null; }
}
const stars = (m: string) => '*'.repeat(Math.max(3, [...m].filter((c) => /[\p{L}\p{N}]/u.test(c)).length));

export type GuardHit = { term: string; category: GuardCategory };

/** يبدّل الكلمات الممنوعة بنجمات في نصٍّ واحد، مع استثناء جُمل قائمة السماح.
 *  يُرجِع النص المشفَّر وقائمة الكلمات المكشوفة (بفئاتها). */
function censorOne(text: string, allowRe: RegExp | null, cats: { category: GuardCategory; hardRe: RegExp | null; wordRe: RegExp | null }[]): { text: string; hits: GuardHit[] } {
  if (!text) return { text: text ?? '', hits: [] };
  const hits: GuardHit[] = [];
  // 1) احمِ جُمل السماح بإحلال رموز محايدة (NUL+رقم) لا تطابق أي كلمة ممنوعة
  const saved: string[] = [];
  let work = text;
  if (allowRe) {
    allowRe.lastIndex = 0;
    work = work.replace(allowRe, (m) => { const tok = `\uE000${saved.length}\uE001`; saved.push(m); return tok; });
  }
  // 2) شفّر لكل فئة: الجذور الصريحة (كجزء من كلمة) ثم الكلمات/الجُمل الكاملة
  for (const c of cats) {
    for (const re of [c.hardRe, c.wordRe]) {
      if (!re) continue;
      re.lastIndex = 0;
      work = work.replace(re, (m) => { hits.push({ term: normalize(m).slice(0, 40), category: c.category }); return stars(m); });
    }
  }
  // 3) أعِد جُمل السماح كما كانت
  work = work.replace(/\uE000(\d+)\uE001/g, (_m, i) => saved[Number(i)] ?? '');
  return { text: work, hits };
}

/** يشفّر عدة حقول دفعةً واحدة (عنوان + وصف…) ويجمع الكلمات المكشوفة بفئاتها. */
export async function censorGuard(...parts: (string | null | undefined)[]): Promise<{ parts: string[]; hits: GuardHit[] }> {
  await Promise.all([loadGuardWords().catch(() => {}), loadAllowed().catch(() => {})]);
  const allowed = allowCache.list;
  const allowRe = makeRe(allowed, true);
  // فئات المطابقة: الجذور الصريحة (HARD) + الكلمات المبنية والمخصّصة لكل فئة
  const hardByCat: Record<GuardCategory, string[]> = { immoral: [], drugs: [], weapons: [], political: [], charity: [] };
  for (const h of HARD) hardByCat[h.cat].push(h.sub);
  const cats = GUARD_CATEGORIES.map((category) => ({
    category,
    hardRe: makeRe(hardByCat[category], false),
    wordRe: makeRe([...BUILTIN[category], ...custom[category]], true),
  }));
  const hits: GuardHit[] = [];
  const outParts = parts.map((p) => { const r = censorOne(p ?? '', allowRe, cats); hits.push(...r.hits); return r.text; });
  // إزالة التكرار (كلمة+فئة)
  const seen = new Set<string>();
  const uniq = hits.filter((h) => { const k = `${h.category}:${h.term}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { parts: outParts, hits: uniq };
}

/** ملخّص نصّي للكلمات المكشوفة لعرضه للإدارة/العضو. */
export function summarizeHits(hits: GuardHit[]): string {
  if (!hits.length) return '';
  const byCat = new Map<GuardCategory, string[]>();
  for (const h of hits) { const a = byCat.get(h.category) || []; a.push(h.term); byCat.set(h.category, a); }
  return [...byCat.entries()].map(([c, ws]) => `${CATEGORY_LABEL[c]}: ${[...new Set(ws)].join('، ')}`).join(' — ').slice(0, 380);
}

/* ---- admin management ---- */
export async function getGuardWords(): Promise<{ id: number; category: GuardCategory; word: string }[]> {
  await ensure();
  const rows = await prisma.guard_words.findMany({ orderBy: { id: 'desc' } }).catch(() => []);
  return rows.filter((r) => (GUARD_CATEGORIES as string[]).includes(r.category)).map((r) => ({ id: Number(r.id), category: r.category as GuardCategory, word: r.word }));
}
export async function addGuardWord(category: GuardCategory, word: string) {
  await ensure();
  const w = word.trim();
  if (!w || !GUARD_CATEGORIES.includes(category)) return;
  await prisma.guard_words.create({ data: { category, word: w.slice(0, 120) } });
  loadedAt = 0;
}
export async function deleteGuardWord(id: number) {
  await ensure();
  await prisma.guard_words.deleteMany({ where: { id } });
  loadedAt = 0;
}
