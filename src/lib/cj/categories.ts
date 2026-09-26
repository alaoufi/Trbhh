import 'server-only';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * تصنيفات بسيطة قابلة للتحكّم من الإدارة (بلا جداول/تعقيد): تُخزَّن كنصّ في إعداد
 * واحد، سطر لكل قسم رئيسي متبوعاً بأقسامه الفرعية بعد نقطتين، مفصولة بفواصل:
 *   المنزل والحديقة: وسائد، سجاد، ستائر
 *   ملابس رجالية: ستُرات، أحذية
 * يُشتقّ منها قائمة خيارات: «رئيسي» و«رئيسي / فرعي» — للاختيار على السلعة (أو كتابة قيمة جديدة).
 */
export const CJ_CATEGORY_TREE_KEY = 'cj_category_tree';

export async function getCjCategoryText(): Promise<string> {
  return getSetting(CJ_CATEGORY_TREE_KEY, '').catch(() => '');
}
export async function setCjCategoryText(value: string): Promise<void> {
  await setSetting(CJ_CATEGORY_TREE_KEY, (value || '').slice(0, 20000));
}

export type CjCategory = { main: string; subs: string[] };

/** يحوّل النصّ إلى شجرة أقسام (رئيسي + فرعية)، بلا تكرار وبحدود آمنة. */
export function parseCjCategoryTree(text: string): CjCategory[] {
  const out: CjCategory[] = [];
  const seenMain = new Set<string>();
  for (const line of (text || '').split(/\r?\n/)) {
    const idx = line.search(/[:：]/);
    const main = (idx >= 0 ? line.slice(0, idx) : line).trim();
    if (!main || seenMain.has(main)) continue;
    seenMain.add(main);
    const subs = idx >= 0
      ? [...new Set(line.slice(idx + 1).split(/[،,]/).map(s => s.trim()).filter(Boolean))].slice(0, 60)
      : [];
    out.push({ main, subs });
    if (out.length >= 100) break;
  }
  return out;
}

/** قائمة خيارات مسطّحة: «رئيسي» و«رئيسي / فرعي» — لاستخدامها في datalist/اختيار. */
export function cjCategoryOptions(tree: CjCategory[]): string[] {
  const out: string[] = [];
  for (const c of tree) {
    out.push(c.main);
    for (const s of c.subs) out.push(`${c.main} / ${s}`);
  }
  return [...new Set(out)].slice(0, 600);
}

export async function getCjCategoryOptions(): Promise<string[]> {
  return cjCategoryOptions(parseCjCategoryTree(await getCjCategoryText()));
}
