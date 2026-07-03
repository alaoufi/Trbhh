import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get('trbhh_vid')) {
    const vid = crypto.randomUUID();
    res.cookies.set('trbhh_vid', vid, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  // A logged-in member must never be served a cached (anonymous) copy of a page.
  // Behind a shared cache (Varnish/CDN) that would show them a login prompt on
  // pages they should already be inside — an endless "please log in" loop. Marking
  // authenticated responses private + no-store tells every proxy to bypass its cache.
  if (req.cookies.get('trbhh_session')) {
    res.headers.set('Cache-Control', 'private, no-store, must-revalidate');
    res.headers.set('Vary', 'Cookie');
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|media|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|placeholder).*)'],
};
