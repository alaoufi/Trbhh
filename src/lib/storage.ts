import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

/** Root dir for uploaded media (mount as a persistent volume in production). */
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

/** True only when a relative path resolves inside the given storage directory. */
export function isSafeStoragePath(baseDir: string, relPath: string): boolean {
  if (!relPath || path.isAbsolute(relPath)) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, relPath);
  const relative = path.relative(resolvedBase, resolvedPath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
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
