import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { destroySession } from '@/lib/auth';

/**
 * A prefetch/preload must NEVER log the user out. Browsers and Next.js may
 * speculatively fetch links (hover, viewport, <link rel=prefetch>, crawlers),
 * which would silently destroy the session and force a repeated login. We only
 * clear the session on a real, user-initiated request.
 */
function isPrefetch(req: Request): boolean {
  const h = req.headers;
  if (h.get('next-router-prefetch') === '1') return true;
  const purpose = (h.get('purpose') || h.get('x-purpose') || h.get('sec-purpose') || '').toLowerCase();
  return purpose.includes('prefetch') || purpose.includes('preview') || purpose.includes('prerender');
}

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  await destroySession();
  redirect('/');
}

export async function POST() {
  await destroySession();
  redirect('/');
}
