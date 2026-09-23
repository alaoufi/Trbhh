import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** Read an image-baked marker, never a mutable runtime environment variable. */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
  try {
    const commit = (await readFile(path.join(process.cwd(), 'RELEASE_COMMIT'), 'utf8')).trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('unavailable');
    return Response.json({ commit }, { headers });
  } catch {
    return Response.json({ error: 'release_version_unavailable' }, { status: 503, headers });
  }
}
