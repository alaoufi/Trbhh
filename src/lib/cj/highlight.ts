import 'server-only';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * أوسمة التمييز التسويقية المتاحة (قابلة للتحكم من لوحة الإدارة عبر إعداد
 * cj_highlight_labels). كل وسم = كلمة + لونها الخاص. الأدمن يختار أحدها لكل سلعة
 * فيظهر على صورة البطاقة باللون المحدَّد. الافتراضي «متميز» بالأحمر.
 *
 * تنسيق التخزين: سطر لكل وسم بصيغة «الكلمة | #اللون» (اللون اختياري، افتراضه الأحمر).
 * على السلعة نُخزّن القيمة المركّبة «الكلمة|#اللون» في العمود highlight_label حتى
 * تُرسَم البطاقة بلونها دون جلب إضافي.
 */
export const CJ_HIGHLIGHT_SETTING = 'cj_highlight_labels';
const DEFAULT_COLOR = '#dc2626'; // أحمر (red-600)
const DEFAULT_RAW = 'متميز | #dc2626';

export type CjHighlight = { label: string; color: string };

/** تطبيع لون: يقبل #hex (3/6) فقط، وإلا يعيد الأحمر الافتراضي. */
export function normalizeHighlightColor(raw: string): string {
  const c = (raw || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c.toLowerCase() : DEFAULT_COLOR;
}

/** يفكّ قيمة مخزَّنة «الكلمة|#اللون» إلى {label,color}. */
export function parseHighlightValue(raw: string | null | undefined): CjHighlight | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const [labelPart, colorPart] = s.split('|');
  const label = (labelPart || '').trim().slice(0, 40);
  if (!label) return null;
  return { label, color: normalizeHighlightColor(colorPart || '') };
}

function parseLine(line: string): CjHighlight | null {
  const [labelPart, colorPart] = line.split(/[|=:]/);
  const label = (labelPart || '').trim();
  if (!label || label.length > 40) return null;
  return { label, color: normalizeHighlightColor(colorPart || '') };
}

export async function cjHighlights(): Promise<CjHighlight[]> {
  const raw = await getSetting(CJ_HIGHLIGHT_SETTING, DEFAULT_RAW).catch(() => DEFAULT_RAW);
  const seen = new Set<string>();
  const out: CjHighlight[] = [];
  for (const line of (raw || '').split(/\n/)) {
    const h = parseLine(line);
    if (h && !seen.has(h.label)) { seen.add(h.label); out.push(h); }
  }
  return out.slice(0, 20);
}

/** القيمة المركّبة «الكلمة|#اللون» لكل وسم — لاستخدامها قيمةً لخيار الاختيار. */
export function highlightValue(h: CjHighlight): string {
  return `${h.label}|${h.color}`;
}

/** حفظ القائمة من نصّ المحرِّر (سطر لكل وسم «الكلمة | #اللون»). */
export async function saveCjHighlights(raw: string): Promise<void> {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of (raw || '').split(/\n/)) {
    const h = parseLine(line);
    if (h && !seen.has(h.label)) { seen.add(h.label); lines.push(`${h.label} | ${h.color}`); }
    if (lines.length >= 20) break;
  }
  await setSetting(CJ_HIGHLIGHT_SETTING, lines.join('\n')).catch(() => {});
}

/** نصّ المحرِّر الحالي (للعرض في textarea لوحة الإدارة). */
export async function cjHighlightsText(): Promise<string> {
  return (await cjHighlights()).map((h) => `${h.label} | ${h.color}`).join('\n');
}

/** القيم المركّبة المسموح بها (للتحقّق عند الحفظ على السلعة). */
export async function allowedHighlightValues(): Promise<string[]> {
  return (await cjHighlights()).map(highlightValue);
}
