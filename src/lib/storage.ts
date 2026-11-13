import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

/** Root dir for uploaded media (mount as a persistent volume in production). */
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

/** True only when a relative path resolves inside the given storage directory. */
export function isSafeStoragePath(baseDir: string, relPath: string): boolean {
  // Uploaded paths may originate from a Windows client while the production
  // container runs Linux. Check both path syntaxes so `C:/...` and UNC paths
  // can never be treated as relative merely because of the host OS.
  if (!relPath || path.isAbsolute(relPath) || path.posix.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, relPath);
  const relative = path.relative(resolvedBase, resolvedPath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

/** امتدادات يُسمح بتخزينها. أي امتداد آخر (svg/html/js…) يُحفظ كـ«bin» فلا يُخدَّم ولا
 *  يُنفَّذ: كان فشل معالجة الصورة يحفظ الملف الأصلي بامتداد العميل، فيُرفع SVG فيه سكربت. */
const STORABLE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'pdf',
  'mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp', 'ogg', 'mp3', 'm4a', 'wav']);

/** اسم ملف آمن للتخزين: بلا مسارات، حروف محدودة، وامتداد من القائمة المسموحة فقط. */
export function safeUploadName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() || 'file';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120) || 'file';
  const ext = (dot > 0 ? base.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${stem}.${STORABLE_EXT.has(ext) ? ext : 'bin'}`;
}

export async function saveUpload(buffer: Buffer, fileName: string): Promise<string> {
  const rel = path.join('uploads', safeUploadName(fileName));
  const abs = path.join(STORAGE_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel.replace(/\\/g, '/'); // stored as uploads/<name>
}

export async function readLocal(relPath: string): Promise<Buffer | null> {
  try {
    if (!isSafeStoragePath(STORAGE_DIR, relPath)) return null;
    const abs = path.join(STORAGE_DIR, relPath);
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/** Absolute path of a stored file if it is inside STORAGE_DIR (traversal-safe). */
export function localAbsPath(relPath: string): string | null {
  if (!isSafeStoragePath(STORAGE_DIR, relPath)) return null;
  const abs = path.join(STORAGE_DIR, relPath);
  return abs;
}

/** Return { abs, size } for an existing file inside baseDir (traversal-safe). */
export async function statInDir(baseDir: string, relPath: string): Promise<{ abs: string; size: number } | null> {
  if (!isSafeStoragePath(baseDir, relPath)) return null;
  const abs = path.join(baseDir, relPath);
  try {
    const st = await fs.stat(abs);
    return st.isFile() ? { abs, size: st.size } : null;
  } catch {
    return null;
  }
}

/** Return { abs, size } for an existing local (uploads) file, else null. */
export async function statLocal(relPath: string): Promise<{ abs: string; size: number } | null> {
  return statInDir(STORAGE_DIR, relPath);
}
