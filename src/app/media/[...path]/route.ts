import { NextRequest } from 'next/server';
import { readLocal } from '@/lib/storage';

const LEGACY = (process.env.LEGACY_MEDIA_BASE || 'https://trbhh.com').replace(/\/$/, '');

const TYPES: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', avif: 'image/avif',
  mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const rel = parts.join('/');
  const ext = rel.split('.').pop()?.toLowerCase() || '';
  const contentType = TYPES[ext] || 'application/octet-stream';

  // 1) local storage
  const local = await readLocal(rel);
  if (local) {
    return new Response(new Uint8Array(local), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  // 2) legacy proxy
  try {
    const upstream = await fetch(`${LEGACY}/${rel}`, { cache: 'force-cache' });
    if (!upstream.ok) return new Response('Not found', { status: 404 });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
