import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { redirectLegacyApex, requestHostname } from '@/lib/public-origin';
import { SITE } from '@/lib/constants';
import { isPreviewReadOnly, previewRequestAllowed } from '@/lib/preview-mode';
import { isPreviewSandbox, sandboxRequestAllowed } from '@/lib/preview-sandbox';

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

/** المسارات المسموح بها على نطاق متجر فرعي — كل ما عداها يعود للنطاق الرئيسي (استقلالية تامة). */
const SUB_ALLOWED = /^\/(companies\/|store-login|store-forgot|login|logout|forgot|media\/|api\/|p\/|_next|play\/|guide\/how)/;

export function middleware(req: NextRequest) {
  if (isPreviewSandbox()) {
    const target = req.nextUrl.pathname + req.nextUrl.search;
    if (!sandboxRequestAllowed(req.method, target) || req.headers.has('next-action')) {
      return new NextResponse('Sandbox route unavailable', {status: ['GET','HEAD'].includes(req.method) ? 404 : 405});
    }
    if (req.nextUrl.pathname === '/login') {
      const url = req.nextUrl.clone(); url.pathname = '/preview-login';
      return NextResponse.redirect(url);
    }
    const headers = new Headers(req.headers);
    headers.set('x-pathname', target);
    const response = NextResponse.next({request: {headers}});
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }
  if (isPreviewReadOnly()) {
    // Do not apply production/store redirects or issue a visitor cookie.
    const target = req.nextUrl.pathname + req.nextUrl.search;
    if (!previewRequestAllowed(req.method, target) || req.headers.has('next-action')) {
      return new NextResponse('Preview: read-only public routes only', {
        status: req.method === 'GET' || req.method === 'HEAD' ? 404 : 405,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    const headers = new Headers(req.headers);
    headers.set('x-pathname', target);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }
  // Preserve the former matcher's bypass behavior when preview is disabled.
  if (/^\/(?:_next\/static|_next\/image|media|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|placeholder)/.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const hostname = requestHostname(
    req.headers.get('x-forwarded-host'),
    req.headers.get('host'),
    req.nextUrl.hostname,
  );
  // The old apex stays reachable for existing links, but the Saudi domain is
  // the single platform URL presented to visitors and search engines.
  const primary = redirectLegacyApex(hostname, req.nextUrl.pathname, req.nextUrl.search);
  if (primary) return NextResponse.redirect(primary, 308);

  // store subdomains: saud.trbhh.com → render that store at its own domain
  const sub = storeSubdomain(hostname);
  if (sub) {
    const path = req.nextUrl.pathname || '/';
    if (path === '/' || path === '') {
      const url = req.nextUrl.clone();
      url.pathname = `/companies/${sub}`;
      const rw = NextResponse.rewrite(url);
      if (!req.cookies.get('trbhh_vid')) {
        rw.cookies.set('trbhh_vid', crypto.randomUUID(), { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
      }
      return rw;
    }
    // /p/<adId> على النطاق الفرعي = صفحة منتج المتجر نفسه
    const pm = path.match(/^\/p\/(\d+)$/);
    if (pm) {
      const url = req.nextUrl.clone();
      url.pathname = `/companies/${sub}/p/${pm[1]}`;
      return NextResponse.rewrite(url);
    }
    // أي صفحة تربح أخرى: عُد للنطاق الرئيسي — نطاق المتجر يخدم متجره فقط
    if (!SUB_ALLOWED.test(path)) {
      const url = req.nextUrl.clone();
      url.hostname = SITE.domain;
      return NextResponse.redirect(url, 307);
    }
  }

  // expose the current path so server guards can send the user back after login
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (!req.cookies.get('trbhh_vid')) {
    const vid = crypto.randomUUID();
    res.cookies.set('trbhh_vid', vid, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
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
  matcher: ['/:path*'],
};
