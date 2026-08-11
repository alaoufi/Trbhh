import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { primaryOrigin, redirectLegacyApex, requestHostname } from '@/lib/public-origin';

describe('public origin', () => {
  it('makes trbhh.sa the primary origin', () => {
    expect(primaryOrigin).toBe('https://trbhh.sa');
  });

  it('redirects only the .com apex to the matching Saudi URL', () => {
    expect(redirectLegacyApex('trbhh.com', '/ads/22', '?source=old')).toBe('https://trbhh.sa/ads/22?source=old');
    expect(redirectLegacyApex('store.trbhh.com', '/', '')).toBeNull();
  });

  it('uses the forwarded public host when the container hostname is internal', () => {
    expect(requestHostname('trbhh.com', 'trbhh.com', '0.0.0.0')).toBe('trbhh.com');
    expect(requestHostname(null, 'store.trbhh.com:443', '0.0.0.0')).toBe('store.trbhh.com');
  });

  it('redirects the legacy apex before evaluating store-subdomain routing', () => {
    const middleware = readFileSync(resolve('src/middleware.ts'), 'utf8');
    expect(middleware).toContain('requestHostname(');
    expect(middleware.indexOf('redirectLegacyApex(hostname')).toBeLessThan(middleware.indexOf('storeSubdomain(hostname)'));
  });

  it('builds crawler-facing SEO routes from the public-origin policy', () => {
    const layout = readFileSync(resolve('src/app/layout.tsx'), 'utf8');
    const sitemap = readFileSync(resolve('src/app/sitemap.ts'), 'utf8');
    const robots = readFileSync(resolve('src/app/robots.ts'), 'utf8');
    expect(layout).toContain("from '@/lib/public-origin'");
    expect(sitemap).toContain("from '@/lib/public-origin'");
    expect(robots).toContain("from '@/lib/public-origin'");
  });

  it('uses the effective request host and has no temporary host diagnostics', () => {
    const middleware = readFileSync(resolve('src/middleware.ts'), 'utf8');
    expect(middleware).toContain('requestHostname(');
    expect(middleware).not.toContain('x-trbhh-debug-host');
    expect(middleware).not.toContain('x-trbhh-observed-host');
  });
});
