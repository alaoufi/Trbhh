import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

/** Root dir for uploaded media (mount as a persistent volume in production). */
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

/**
 * يحلّ مساراً نسبياً داخل `base` ويرفض أي خروج منه (اجتياز مسار).
 * يستخدم `path.resolve` لتطبيع `..` والمسارات المطلقة، ثم يفرض أن تكون النتيجة
 * `base` نفسه أو تحته بفاصل مسار حقيقي — فلا يمرّ شقيقٌ يشارك البادئة
 * (مثل `storage-secret` بجانب `storage`) كما كان يمرّ مع `startsWith` المجرّد.
 */
export function safeResolve(base: string, relPath: string): string | null {
  const root = path.resolve(base);
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function saveUpload(buffer: Buffer, fileName: string): Promise<string> {
  const rel = path.join('uploads', fileName);
  const abs = path.join(STORAGE_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel.replace(/\\/g, '/'); // stored as uploads/<name>
}

export async function readLocal(relPath: string): Promise<Buffer | null> {
  try {
    const abs = safeResolve(STORAGE_DIR, relPath); // حارس اجتياز المسار
    if (!abs) return null;
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/** Absolute path of a stored file if it is inside STORAGE_DIR (traversal-safe). */
export function localAbsPath(relPath: string): string | null {
  return safeResolve(STORAGE_DIR, relPath);
}

/** Return { abs, size } for an existing file inside baseDir (traversal-safe). */
export async function statInDir(baseDir: string, relPath: string): Promise<{ abs: string; size: number } | null> {
  const abs = safeResolve(baseDir, relPath);
  if (!abs) return null;
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
