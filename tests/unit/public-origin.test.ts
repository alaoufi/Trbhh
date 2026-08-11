import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { primaryOrigin, redirectLegacyApex } from '@/lib/public-origin';

describe('public origin', () => {
  it('makes trbhh.sa the primary origin', () => {
    expect(primaryOrigin).toBe('https://trbhh.sa');
  });

  it('redirects only the .com apex to the matching Saudi URL', () => {
    expect(redirectLegacyApex('trbhh.com', '/ads/22', '?source=old')).toBe('https://trbhh.sa/ads/22?source=old');
    expect(redirectLegacyApex('store.trbhh.com', '/', '')).toBeNull();
  });

  it('redirects the legacy apex before evaluating store-subdomain routing', () => {
    const middleware = readFileSync(resolve('src/middleware.ts'), 'utf8');
    expect(middleware).toContain("import { redirectLegacyApex } from '@/lib/public-origin'");
    expect(middleware.indexOf('redirectLegacyApex(req.nextUrl.hostname')).toBeLessThan(middleware.indexOf('storeSubdomain(req.nextUrl.hostname)'));
  });

  it('builds crawler-facing SEO routes from the public-origin policy', () => {
    const layout = readFileSync(resolve('src/app/layout.tsx'), 'utf8');
    const sitemap = readFileSync(resolve('src/app/sitemap.ts'), 'utf8');
    const robots = readFileSync(resolve('src/app/robots.ts'), 'utf8');
    expect(layout).toContain("from '@/lib/public-origin'");
    expect(sitemap).toContain("from '@/lib/public-origin'");
    expect(robots).toContain("from '@/lib/public-origin'");
  });

  it('keeps host diagnostics explicitly opt-in while tracing proxy behavior', () => {
    const middleware = readFileSync(resolve('src/middleware.ts'), 'utf8');
    expect(middleware).toContain("x-trbhh-debug-host");
    expect(middleware).toContain("x-trbhh-observed-host");
  });
});
