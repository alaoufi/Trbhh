import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
import type {NextConfig} from 'next';
import {unstable_getResponseFromNextConfig} from 'next/experimental/testing/server';
import nextConfig from '../../next.config.mjs';

const state = vi.hoisted(() => ({parse: vi.fn(), start: vi.fn(), permission: vi.fn()}));
vi.mock('@/lib/prisma', () => ({prisma: {}}));
vi.mock('@/lib/roles', () => ({hasAction: state.permission}));
vi.mock('@/lib/suppliers/merchant-oauth', () => ({parseMerchantInvitation: state.parse, startMerchantOAuth: state.start}));
import {GET, POST} from '@/app/api/integrations/salla/authorize/route';

const origin = 'https://trbhh.sa';
const authorize = '/api/integrations/salla/authorize';
const configResponse = (pathname: string) => unstable_getResponseFromNextConfig({url: origin + pathname, nextConfig: nextConfig as NextConfig});
const directive = (policy: string, name: string) => policy.split(';').map(value => value.trim()).find(value => value.startsWith(name + ' '));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPPLIER_PUBLIC_ORIGIN', origin);
  state.parse.mockReturnValue({supplierId: '2', adminId: '7', expectedName: 'شعبيات الأولين'});
});
afterEach(() => vi.unstubAllEnvs());

describe('owner OAuth header precedence', () => {
  it('uses Next routing to override global form-action only for the exact authorization page', async () => {
    const response = await configResponse(authorize + '?invite=invalid');
    const policy = response.headers.get('content-security-policy')!;
    // A logged-out merchant is redirected from accounts.salla.sa/login to
    // s.salla.sa/auth. Chromium checks the whole form redirect chain.
    expect(directive(policy, 'form-action')).toBe("form-action 'self' https://accounts.salla.sa https://s.salla.sa");
    expect(directive(policy, 'default-src')).toBe("default-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(response.headers.get('referrer-policy')).toBe('strict-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
    expect(response.headers.get('permissions-policy')).toBe('camera=(), geolocation=(), microphone=()');
  });

  it.each(['/', '/login', '/api/integrations/salla/webhooks', '/api/integrations/salla/authorize-other', '/api/integrations/salla/authorize/child'])('preserves global security for %s', async pathname => {
    const response = await configResponse(pathname);
    const policy = response.headers.get('content-security-policy')!;
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(policy).not.toContain('accounts.salla.sa');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('changes only the callback referrer policy, preserving its existing security directives', async () => {
    const callback = await configResponse('/api/integrations/salla/callback?state=invalid');
    const baseline = await configResponse('/api/integrations/salla/webhooks');
    expect(callback.headers.get('referrer-policy')).toBe('no-referrer');
    for (const [name, value] of baseline.headers) {
      if (name !== 'referrer-policy') expect(callback.headers.get(name)).toBe(value);
    }
  });

  it('keeps route and Next config policies identical and strips the invitation path/query before its form', async () => {
    const response = await GET(new NextRequest(origin + authorize + '?invite=test-only'));
    const configured = await configResponse(authorize);
    expect(response.status).toBe(200);
    for (const name of ['content-security-policy', 'referrer-policy', 'x-frame-options']) {
      expect(response.headers.get(name)).toBe(configured.headers.get(name));
    }
    const html = await response.text();
    // Fetch Standard Origin-header algorithm preserves HTTPS same-origin POSTs
    // under strict-origin; no-referrer would instead produce Origin: null.
    const meta = '<meta name="referrer" content="strict-origin">';
    expect(html).toContain(meta);
    expect(html.indexOf(meta)).toBeLessThan(html.indexOf('<form'));
    expect(html).not.toContain('<script');
    expect(state.start).not.toHaveBeenCalled();
    expect(state.permission).not.toHaveBeenCalled();
  });

  it('preserves the strict policy for invalid invitations without starting OAuth', async () => {
    state.parse.mockImplementation(() => {throw Error('invalid_invitation');});
    const response = await GET(new NextRequest(origin + authorize + '?invite=invalid'));
    const configured = await configResponse(authorize + '?invite=invalid');
    expect(response.status).toBe(400);
    expect(response.headers.get('content-security-policy')).toBe(configured.headers.get('content-security-policy'));
    expect(response.headers.get('referrer-policy')).toBe('strict-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(state.start).not.toHaveBeenCalled();
  });

  it('preserves the exact Origin check, rejecting null even with browser metadata and valid CSRF', async () => {
    const csrf = 'a'.repeat(64);
    const response = await POST(new NextRequest(origin + authorize, {
      method: 'POST', headers: {origin: 'null', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'content-type': 'application/x-www-form-urlencoded', cookie: `salla_merchant_start=${csrf}`},
      body: `invite=test-only&csrf=${csrf}`,
    }));
    expect(response.status).toBe(400);
    expect(state.start).not.toHaveBeenCalled();
  });
});
