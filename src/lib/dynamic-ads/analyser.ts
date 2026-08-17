import { createHash } from 'node:crypto';
import type { DynamicAnalysis } from './types';

type Input = { title: string; description: string };
const RULES: Record<string, RegExp[]> = {
  vehicle: [/سيار/, /جيب/, /لكزس/, /تويوتا/, /هوندا/, /ممشى/, /عداد/, /موديل/, /دفع رباعي/, /ناقل/],
  property: [/عقار/, /شقة/, /فيلا/, /أرض/, /عمارة/, /إيجار/, /للبيع/, /مساحة/, /غرف/, /حي/],
  livestock: [/حلال/, /حري/, /نعيمي/, /فحل/, /إبل/, /ابل/, /غنم/, /ماعز/, /سلالة/],
  product: [/جوال/, /جهاز/, /آيفون/, /ايفون/, /لابتوب/, /منتج/],
  service: [/خدمة/, /صيانة/, /تصميم/, /نقل عفش/, /تركيب/, /تنظيف/],
  equipment: [/معدات/, /شيول/, /حفار/, /مولد/, /معدة/, /تريلا/],
};

function textOf(input: Input) { return `${input.title} ${input.description}`.replace(/\s+/g, ' ').trim(); }
export function analysisFingerprint(input: Input): string { return createHash('sha256').update(textOf(input).toLowerCase()).digest('hex'); }

function detectedEntity(text: string): { key: string | null; score: number } {
  let winner: string | null = null; let score = 0;
  for (const [key, rules] of Object.entries(RULES)) {
    const next = rules.reduce((total, rule) => total + (rule.test(text) ? 1 : 0), 0);
    if (next > score) { winner = key; score = next; }
  }
  return { key: winner, score };
}

/** Fast local Arabic-first analyser. It only suggests; it never changes a chosen entity. */
export function analyseDynamicAd(input: Input): DynamicAnalysis {
  const text = textOf(input);
  const { key, score } = detectedEntity(text);
  const extracted: Record<string, string | number | boolean> = {};
  const year = text.match(/\b(19\d{2}|20[0-3]\d)\b/);
  if (year) extracted.year = Number(year[1]);
  const mileage = text.match(/(?:ممشى|ممشاها|عداد)\s*(\d+(?:\.\d+)?)\s*(ألف|الف|k)?/i);
  if (mileage) {
    const raw = Number(mileage[1]);
    extracted.mileage = mileage[2] || raw <= 500 ? Math.round(raw * 1000) : Math.round(raw);
  }
  const area = text.match(/(?:مساحة|المساحه)\s*(\d+(?:\.\d+)?)\s*(?:متر|م²|متر مربع)?/i);
  if (area) extracted.area_sqm = Number(area[1]);
  const rooms = text.match(/(\d+)\s*غرف/);
  if (rooms) extracted.rooms = Number(rooms[1]);
  if (/\b(حري|نعيمي|سواكني)\b/.test(text)) extracted.breed = text.match(/\b(حري|نعيمي|سواكني)\b/)![1];
  if (/\bفحل\b/.test(text)) extracted.gender = 'ذكر';
  if (/للإيجار|ايجار/.test(text)) extracted.purpose = 'للإيجار';
  if (/للبيع/.test(text)) extracted.purpose = 'للبيع';

  const missing: string[] = [];
  const suggestions: string[] = [];
  if (!input.title.trim()) missing.push('عنوان الإعلان');
  if (input.description.trim().length < 20) suggestions.push('أضف وصفاً أوضح يشرح الحالة والمواصفات.');
  if (!key) suggestions.push('اختر نوع الإعلان أو اكتب مواصفات أكثر ليتعرّف عليه المحلل.');
  if (key === 'vehicle' && !extracted.year) missing.push('سنة الصنع');
  if (key === 'property' && !extracted.area_sqm) missing.push('المساحة');
  if (key === 'livestock' && !extracted.breed) missing.push('السلالة');
  if (!/\d/.test(text)) suggestions.push('أضف السعر أو المواصفات الرقمية المهمة.');
  const quality = Math.max(0, Math.min(100, 35 + Math.min(30, input.title.trim().length) + Math.min(20, Math.floor(input.description.trim().length / 10)) + Math.min(15, Object.keys(extracted).length * 5) - missing.length * 8));
  return { entityKey: key, confidence: key ? Math.min(96, 45 + score * 18) : 0, extracted, missing, suggestions, quality };
}
