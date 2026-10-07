import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * نسخة الإصدار المنشورة = أول 7 خانات من RELEASE_COMMIT المخبوز في صورة البناء.
 * تُعرض في الفوتر ليتأكّد المالك دائماً من النسخة الفعلية العاملة على الخادم.
 * تُقرأ مرّة واحدة وتُخزَّن (ثابتة لكل صورة). فارغة في بيئة التطوير بلا الملف.
 */
let cached: string | null = null;
export async function releaseVersion(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const commit = (await readFile(path.join(process.cwd(), 'RELEASE_COMMIT'), 'utf8')).trim();
    cached = /^[a-f0-9]{7,40}$/.test(commit) ? commit.slice(0, 7) : '';
  } catch {
    cached = '';
  }
  return cached;
}
