import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

/** Root dir for uploaded media (mount as a persistent volume in production). */
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

export async function saveUpload(buffer: Buffer, fileName: string): Promise<string> {
  const rel = path.join('uploads', fileName);
  const abs = path.join(STORAGE_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel.replace(/\\/g, '/'); // stored as uploads/<name>
}

export async function readLocal(relPath: string): Promise<Buffer | null> {
  try {
    const abs = path.join(STORAGE_DIR, relPath);
    if (!abs.startsWith(STORAGE_DIR)) return null; // path traversal guard
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/** Absolute path of a stored file if it is inside STORAGE_DIR (traversal-safe). */
export function localAbsPath(relPath: string): string | null {
  const abs = path.join(STORAGE_DIR, relPath);
  return abs.startsWith(STORAGE_DIR) ? abs : null;
}

/** Return { abs, size } for an existing file inside baseDir (traversal-safe). */
export async function statInDir(baseDir: string, relPath: string): Promise<{ abs: string; size: number } | null> {
  const abs = path.join(baseDir, relPath);
  if (!abs.startsWith(baseDir)) return null;
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
