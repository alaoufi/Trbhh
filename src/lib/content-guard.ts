import 'server-only';

export type GuardCategory = 'immoral' | 'drugs' | 'weapons' | 'political';

export const CATEGORY_LABEL: Record<GuardCategory, string> = {
  immoral: 'محتوى غير أخلاقي',
  drugs: 'مخدرات أو مسكرات',
  weapons: 'أسلحة أو محتوى أمني',
  political: 'محتوى سياسي مشبوه',
};

/** Normalize Arabic for robust matching (strip diacritics, unify letters). */
function normalize(s: string): string {
  return (s || '')
    .replace(/[ً-ْٰـ]/g, '') // diacritics + tatweel
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

/** Whole-word / phrase terms per category. */
const TERMS: Record<GuardCategory, string[]> = {
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
};

/**
 * Scan free text for prohibited content. Returns the first matching category
 * (immoral first — strictest), or null when clean.
 */
export function scanContent(...parts: (string | null | undefined)[]): { category: GuardCategory; term: string } | null {
  const t = normalize(parts.filter(Boolean).join(' '));
  if (!t) return null;
  for (const h of HARD) if (t.includes(h.sub)) return { category: h.cat, term: h.sub };
  const padded = ` ${t} `;
  // check immoral first, then the rest
  const order: GuardCategory[] = ['immoral', 'drugs', 'weapons', 'political'];
  for (const cat of order) {
    for (const term of TERMS[cat]) {
      const nt = normalize(term);
      if (nt && padded.includes(` ${nt} `)) return { category: cat, term };
    }
  }
  return null;
}
