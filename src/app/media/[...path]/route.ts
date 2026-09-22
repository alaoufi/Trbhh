import type { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { statLocal, statInDir } from '@/lib/storage';
import { isHeicBytes, heicBytesToJpeg } from '@/lib/upload-normalize';
import { isCanonicalMediaPath, isPotentiallyProtectedUploadPath, isProtectedUploadType } from '@/lib/media-access';

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
  // Legacy safety net: images uploaded before the format fix were re-encoded to
  // JPEG bytes but saved with the source extension (.heic/.heif from iPhones).
  // Serving them as image/jpeg makes those already-stored images render again.
  heic: 'image/jpeg', heif: 'image/jpeg', bmp: 'image/jpeg', tiff: 'image/jpeg', tif: 'image/jpeg',
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
function serveFile(file: { abs: string; size: number }, req: NextRequest, contentType: string, cacheControl = 'public, max-age=31536000, immutable'): Response {
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
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file.abs)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(file.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function protectedMediaCacheControl(rel: string): Promise<string | null> {
  if (!isPotentiallyProtectedUploadPath(rel)) return 'public, max-age=31536000, immutable';
  const { prisma } = await import('@/lib/prisma');
  const upload = await prisma.uploads.findFirst({ where: { file_name: rel }, select: { type: true, user_id: true } }).catch(() => null);
  if (!upload || !isProtectedUploadType(upload.type)) return null;

  const { getSession } = await import('@/lib/auth');
  const session = await getSession();
  if (!session) return null;
  if (upload.user_id === session.uid) return 'private, no-store';

  const { hasAccess } = await import('@/lib/access-control/guards');
  return (await hasAccess(session.uid, 'verifications', 'view').catch(() => false)) ? 'private, no-store' : null;
}

const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'tif', 'tiff']);

/**
 * شبكة أمان للصور القديمة: صور آيفون رُفعت قبل الإصلاح فحُفظت **ببايتات HEIC**
 * تحت امتداد `.jpg` (لا يعرضها أي متصفّح). نكتشفها وقت التقديم من البصمة ونحوّلها
 * إلى JPEG آنيّاً — تُخزَّن مؤقتاً (immutable) فيتم التحويل مرّة واحدة لكل ملف.
 * غير HEIC يمرّ فوراً (قراءة ١٢ بايت فقط) دون أي تكلفة تُذكر.
 */
async function serveConvertedHeic(abs: string, ext: string, cacheControl: string): Promise<Response | null> {
  if (!IMG_EXT.has(ext)) return null;
  let head: Buffer;
  try {
    const fh = await open(abs, 'r');
    try { head = Buffer.alloc(12); await fh.read(head, 0, 12, 0); } finally { await fh.close(); }
  } catch { return null; }
  if (!isHeicBytes(head)) return null;
  try {
    const jpg = await heicBytesToJpeg(await readFile(abs));
    if (!jpg) return null;
    return new Response(new Uint8Array(jpg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpg.length),
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const rel = parts.join('/');
  if (!isCanonicalMediaPath(rel)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const ext = rel.split('.').pop()?.toLowerCase() || '';
  const contentType = TYPES[ext] || 'application/octet-stream';
  const cacheControl = await protectedMediaCacheControl(rel);
  // Return the same response for missing and inaccessible documents so their
  // existence cannot be inferred from a URL or filename.
  if (!cacheControl) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  // 1) app storage (newly uploaded media)
  const local = await statLocal(rel);
  if (local) {
    const heic = await serveConvertedHeic(local.abs, ext, cacheControl);
    if (heic) return heic;
    return serveFile(local, req, contentType, cacheControl);
  }

  // 2) mounted legacy media dir (original site's files) — served with Range too
  if (LEGACY_DIR) {
    const legacy = await statInDir(LEGACY_DIR, rel);
    if (legacy) return serveFile(legacy, req, contentType, cacheControl);
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
        h.set('Cache-Control', cacheControl === 'private, no-store' ? cacheControl : 'public, max-age=86400');
        h.set('X-Content-Type-Options', 'nosniff');
        return new Response(upstream.body, { status: upstream.status, headers: h });
      }
    } catch {
      /* fall through to 404 */
    }
  }

  return new Response('Not found', { status: 404 });
}
