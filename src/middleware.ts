import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// subdomains that are the platform itself, never a store handle
const RESERVED_SUB = new Set(['www', 'api', 'm', 'admin', 'mail', 'ftp', 'cdn', 'static', 'assets', 'app', 'apps', 'store', 'stores', 'trbhh', 'ns1', 'ns2', 'blog', 'help', 'support', 'dev', 'test', 'staging']);

/** Extract a store handle from a `<handle>.trbhh.com` host (else ''). */
function storeSubdomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host.endsWith('.trbhh.com')) return '';
  const label = host.slice(0, -'.trbhh.com'.length);
  if (!label || label.includes('.') || RESERVED_SUB.has(label)) return '';
  return label;
}

export function middleware(req: NextRequest) {
  // store subdomains: saud.trbhh.com → render that store at its own domain
  const sub = storeSubdomain(req.nextUrl.hostname);
  if (sub && (req.nextUrl.pathname === '/' || req.nextUrl.pathname === '')) {
    const url = req.nextUrl.clone();
    url.pathname = `/companies/${sub}`;
    return NextResponse.rewrite(url);
  }

  // expose the current path so server guards can send the user back after login
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
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
