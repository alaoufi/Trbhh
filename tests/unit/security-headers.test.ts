import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.mjs';

describe('production security headers', () => {
  it('applies baseline browser protections to every route', async () => {
    const rules = await nextConfig.headers();
    const allRoutes = rules.find((rule: { source: string }) => rule.source === '/:path*');
    const headers = new Map(allRoutes?.headers.map((header: { key: string; value: string }) => [header.key, header.value]));

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
  });

  it('does not suppress type failures during production builds', () => {
    expect('eslint' in nextConfig).toBe(false);
    expect(nextConfig.typescript?.ignoreBuildErrors).toBe(false);
  });
});
