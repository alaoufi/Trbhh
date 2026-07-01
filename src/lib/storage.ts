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
