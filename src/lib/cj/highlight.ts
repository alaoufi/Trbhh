import 'server-only';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * قائمة أوسمة التمييز التسويقية المتاحة (قابلة للتحكم من لوحة الإدارة عبر إعداد
 * cj_highlight_labels). الأدمن يختار أحدها لكل سلعة فتظهر على صورة البطاقة باللون الأحمر.
 * الافتراضي «متميز». لا نصوص ثابتة في الكود — القائمة من الإعدادات.
 */
export const CJ_HIGHLIGHT_SETTING = 'cj_highlight_labels';
const DEFAULT_LABELS = 'متميز';

export async function cjHighlightLabels(): Promise<string[]> {
  const raw = await getSetting(CJ_HIGHLIGHT_SETTING, DEFAULT_LABELS).catch(() => DEFAULT_LABELS);
  return [...new Set((raw || '').split(/[\n,،]/).map((s) => s.trim()).filter((s) => s && s.length <= 40))].slice(0, 20);
}

export async function saveCjHighlightLabels(raw: string): Promise<void> {
  const list = [...new Set((raw || '').split(/[\n,،]/).map((s) => s.trim()).filter((s) => s && s.length <= 40))].slice(0, 20);
  await setSetting(CJ_HIGHLIGHT_SETTING, list.join('\n')).catch(() => {});
}
