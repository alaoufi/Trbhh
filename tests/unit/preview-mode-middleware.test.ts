import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from '../../src/middleware';

afterEach(() => vi.unstubAllEnvs());

it('covers assets too and blocks POST/server actions before redirects', () => {
  vi.stubEnv('PREVIEW_READ_ONLY', 'true');
  expect(config.matcher).toEqual(['/:path*']);
  for (const path of ['/', '/ads/new', '/media/uploads/a.jpg', '/_next/static/a.js']) {
    const response = middleware(new NextRequest(`https://preview.example${path}`, { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('location')).toBeNull();
  }
  expect(middleware(new NextRequest('https://preview.example/', { headers: { 'next-action': 'anything' } })).status).toBe(404);
});

it('serves permitted GET without session/visitor cookies or production redirects', () => {
  vi.stubEnv('PREVIEW_READ_ONLY', 'true');
  const response = middleware(new NextRequest('https://shop.trbhh.com/search?q=a', { headers: { cookie: 'trbhh_session=untrusted' } }));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('x-robots-tag')).toContain('noindex');
  expect(response.headers.get('cache-control')).toContain('no-store');
  for (const path of ['/admin', '/logout', '/api/pay/callback/test', '/account/topup', '/%61dmin']) {
    expect(middleware(new NextRequest(`https://preview.example${path}`)).status, path).toBe(404);
  }
});

it('retains original middleware behavior with gate off', () => {
  vi.stubEnv('PREVIEW_READ_ONLY', 'false');
  const asset = middleware(new NextRequest('https://preview.example/media/a.jpg', { method: 'POST' }));
  expect(asset.headers.get('x-middleware-next')).toBe('1');
  expect(asset.headers.get('set-cookie')).toBeNull();
  const page = middleware(new NextRequest('https://preview.example/search'));
  expect(page.headers.get('x-middleware-next')).toBe('1');
  expect(page.headers.get('set-cookie')).toContain('trbhh_vid=');
});
