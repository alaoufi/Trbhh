import type { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { statLocal, statInDir } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEGACY = (process.env.LEGACY_MEDIA_BASE || '').replace(/\/$/, '');
// Optional read-only mount of the original site's media dir (e.g. haftastore/public)
const LEGACY_DIR = process.env.LEGACY_LOCAL_DIR || '';

const TYPES: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', avif: 'image/avif',
  mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  '3gp': 'video/3gpp', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
};

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  let start = m[1] ? parseInt(m[1], 10) : NaN;
  let end = m[2] ? parseInt(m[2], 10) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) { start = size - end; end = size - 1; }       // suffix bytes=-N
  else if (Number.isNaN(end)) { end = size - 1; }                        // bytes=N-
  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  if (start > end) return null;
  return { start, end };
}

/** Stream a local file with HTTP Range support (needed for video playback). */
function serveFile(file: { abs: string; size: number }, req: NextRequest, contentType: string): Response {
  const range = parseRange(req.headers.get('range'), file.size);
  if (range) {
    const { start, end } = range;
    const stream = Readable.toWeb(createReadStream(file.abs, { start, end })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${file.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file.abs)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(file.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const rel = parts.join('/');
  const ext = rel.split('.').pop()?.toLowerCase() || '';
  const contentType = TYPES[ext] || 'application/octet-stream';

  // 1) app storage (newly uploaded media)
  const local = await statLocal(rel);
  if (local) return serveFile(local, req, contentType);

  // 2) mounted legacy media dir (original site's files) — served with Range too
  if (LEGACY_DIR) {
    const legacy = await statInDir(LEGACY_DIR, rel);
    if (legacy) return serveFile(legacy, req, contentType);
  }

  // 3) legacy URL proxy — forward Range, stream body (skip if unset / would loop)
  if (LEGACY) {
    try {
      const range = req.headers.get('range');
      const upstream = await fetch(`${LEGACY}/${rel}`, { headers: range ? { Range: range } : undefined, cache: 'no-store' });
      if (upstream.ok || upstream.status === 206) {
        const h = new Headers();
        h.set('Content-Type', upstream.headers.get('content-type') || contentType);
        for (const k of ['content-length', 'content-range', 'accept-ranges']) {
          const v = upstream.headers.get(k);
          if (v) h.set(k, v);
        }
        if (!h.has('accept-ranges')) h.set('Accept-Ranges', 'bytes');
        h.set('Cache-Control', 'public, max-age=86400');
        return new Response(upstream.body, { status: upstream.status, headers: h });
      }
    } catch {
      /* fall through to 404 */
    }
  }

  return new Response('Not found', { status: 404 });
}
