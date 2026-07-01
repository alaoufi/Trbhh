import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get('trbhh_vid')) {
    const vid = crypto.randomUUID();
    res.cookies.set('trbhh_vid', vid, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|media|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|placeholder).*)'],
};
