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
  const t = normalize(parts.filter(Boolean).join(' '));
  if (!t) return null;
  for (const h of HARD) if (t.includes(h.sub)) return { category: h.cat, term: h.sub };
  const padded = ` ${t} `;
  for (const cat of GUARD_CATEGORIES) {
    for (const term of [...BUILTIN[cat], ...custom[cat]]) {
      const nt = normalize(term);
      if (nt && padded.includes(` ${nt} `)) return { category: cat, term };
    }
  }
  return null;
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
