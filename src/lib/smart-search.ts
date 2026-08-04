import { RE_TYPES } from './realestate-types';

// بحث ذكي بالكلام الطبيعي (فكرة Zillow/Rightmove): يحوّل جملة عربية مثل
// «دور للبيع في حي النرجس بالرياض ٣ غرف بأقل من مليون» إلى فلاتر منظّمة.
// دالة نقيّة (بلا خادم) — تُغذّى بقوائم المناطق/المدن لمطابقة المواقع.

export type SmartQuery = {
  cityId?: number; areaId?: number; reType?: string;
  purpose?: 'rent' | 'sale'; priceMin?: number; priceMax?: number;
  beds?: number; areaMin?: number; rest: string;
};
type Named = { id: number; name: string; cityId?: number };

const AR_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] || d);
}
function norm(s: string): string {
  return toLatinDigits(s).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}

// «مليون ونصف» / «٨٠٠ الف» / «مليونين» → قيمة رقمية بالريال
function parseAmount(text: string): number | null {
  const t = norm(text);
  if (/مليونين/.test(t)) return 2_000_000;
  if (/مليون ونص|مليون ونصف/.test(t)) return 1_500_000;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(مليون|ملايين|الف|الاف|ك)?/);
  if (m) {
    let v = parseFloat(m[1]);
    const unit = m[2] || '';
    if (/مليون|ملايين/.test(unit)) v *= 1_000_000;
    else if (/الف|الاف|ك/.test(unit)) v *= 1_000;
    if (v > 0) return Math.round(v);
  }
  if (/(^|\s)مليون(\s|$)/.test(t)) return 1_000_000;
  return null;
}
function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const WORD_BEDS: Record<string, number> = { 'غرفه': 1, 'غرفتين': 2, 'غرفتان': 2 };
// كلمات ربط تُزال من بقية النص حتى لا تُضيّق مطابقة العنوان/التفاصيل
const STOP = new Set(['في', 'فى', 'حي', 'بحي', 'منطقه', 'مدينه', 'ب', 'بـ', 'مع', 'و', 'من', 'الى', 'على', 'تحت', 'اقل', 'باقل', 'حد', 'ميزانيه', 'بحدود', 'عن', 'فوق', 'اكثر', 'يزيد', 'ابتداء', 'متر', 'مساحه', 'لا', 'يتجاوز']);

export function parseSmartQuery(input: string, regions: Named[], areas: Named[]): SmartQuery {
  const original = (input || '').trim();
  let t = norm(original);
  const out: SmartQuery = { rest: '' };
  const strip = (re: RegExp) => { t = t.replace(re, ' ').replace(/\s+/g, ' ').trim(); };

  // ١) الغرض: بيع / إيجار
  if (/(للايجار|الايجار|ايجار|تاجير|للتاجير)/.test(t)) { out.purpose = 'rent'; strip(/(للايجار|الايجار|ايجار|تاجير|للتاجير)/g); }
  else if (/(للبيع|البيع|تمليك|للتمليك)/.test(t)) { out.purpose = 'sale'; strip(/(للبيع|البيع|تمليك|للتمليك)/g); }

  // ٢) نوع العقار — أطول تطابق أولاً (محل تجاري قبل محل)
  const typesByLen = [...RE_TYPES].sort((a, b) => norm(b).length - norm(a).length);
  for (const rt of typesByLen) {
    const n = norm(rt);
    if (new RegExp(`(^|\\s)${esc(n)}(\\s|$)`).test(t)) { out.reType = rt; strip(new RegExp(esc(n), 'g')); break; }
  }

  // ٣) الموقع — الحي (أطول تطابق أولاً) ثم المنطقة
  const areaMatch = [...areas].sort((a, b) => norm(b.name).length - norm(a.name).length)
    .find((a) => a.name && norm(a.name).length >= 3 && t.includes(norm(a.name)));
  if (areaMatch) { out.areaId = areaMatch.id; if (areaMatch.cityId) out.cityId = areaMatch.cityId; strip(new RegExp(esc(norm(areaMatch.name)), 'g')); }
  const regionMatch = [...regions].sort((a, b) => norm(b.name).length - norm(a.name).length)
    .find((r) => r.name && norm(r.name).length >= 3 && t.includes(norm(r.name)));
  if (regionMatch) { out.cityId = out.cityId || regionMatch.id; strip(new RegExp(esc(norm(regionMatch.name)), 'g')); }

  // ٤) الغرف: «٣ غرف» / «غرفتين»
  const bedsNum = t.match(/(\d+)\s*(?:غرف نوم|غرف|غرفه|غرفة)/);
  if (bedsNum) { out.beds = parseInt(bedsNum[1], 10); strip(/(\d+)\s*(?:غرف نوم|غرف|غرفه|غرفة)/g); }
  else { for (const [w, n] of Object.entries(WORD_BEDS)) if (t.includes(w)) { out.beds = n; strip(new RegExp(w, 'g')); break; } }

  // ٥) المساحة: «مساحة ٥٠٠» / «٥٠٠ متر» → حدّ أدنى للمساحة (قبل السعر لئلا يُلتقط الرقم كسعر)
  const areaM = t.match(/(?:مساحه\s*)(\d{2,})|(\d{2,})\s*متر/);
  if (areaM) { const v = parseInt(areaM[1] || areaM[2], 10); if (v > 0) { out.areaMin = v; strip(new RegExp(esc(areaM[0]), 'g')); } }

  // ٦) السعر: أوّل مبلغ في النص + اتجاه من الكلمة السابقة (الافتراضي سقف)
  const amountRe = /(\d+(?:\.\d+)?\s*(?:مليون|ملايين|الف|الاف|ك)|مليونين|مليون ونصف|مليون ونص|مليون|\d{4,})/;
  const am = t.match(amountRe);
  if (am && am.index != null) {
    const v = parseAmount(am[0]);
    if (v) {
      const before = t.slice(Math.max(0, am.index - 14), am.index);
      // «أقل من/تحت/ميزانية» = سقف؛ «أكثر من/فوق» = حدّ أدنى؛ «من» المجرّدة → سقف افتراضاً
      if (/(اقل|باقل|تحت|حد|ميزاني|بحدود|يتجاوز)\s*(من\s*)?$/.test(before)) out.priceMax = v;
      else if (/(اكثر|فوق|يزيد|ابتداء)\s*(من\s*)?$/.test(before)) out.priceMin = v;
      else out.priceMax = v;
      strip(new RegExp(esc(am[0]), 'g'));
    }
  }

  // ٧) الباقي = كلمات وصفية (حوش/مسبح/قريب…)؛ نُزيل كلمات الربط والأرقام المفردة
  out.rest = t.split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1).join(' ').trim();
  return out;
}

/** يحوّل نتيجة التحليل إلى معطيات رابط /search. */
export function smartQueryToParams(sq: SmartQuery): Record<string, string> {
  const p: Record<string, string> = {};
  if (sq.rest) p.q = sq.rest;
  if (sq.cityId) p.city = String(sq.cityId);
  if (sq.areaId) p.area = String(sq.areaId);
  if (sq.reType) p.reType = sq.reType;
  if (sq.purpose) p.purpose = sq.purpose;
  if (sq.priceMin) p.priceMin = String(sq.priceMin);
  if (sq.priceMax) p.priceMax = String(sq.priceMax);
  if (sq.beds) p.beds = String(sq.beds);
  if (sq.areaMin) p.areaMin = String(sq.areaMin);
  return p;
}
