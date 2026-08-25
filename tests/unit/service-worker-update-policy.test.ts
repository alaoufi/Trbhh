import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worker = readFileSync('public/sw.js', 'utf8');
const register = readFileSync('src/components/pwa-register.tsx', 'utf8');
const nextConfig = readFileSync('next.config.mjs', 'utf8');

describe('service worker update policy', () => {
  it('uses a versioned registration URL so a cached worker cannot block an update', () => {
    expect(register).toContain("navigator.serviceWorker.register('/sw.js?v=8')");
    expect(nextConfig).toContain("source: '/sw.js'");
    expect(nextConfig).toContain("value: 'no-cache, no-store, must-revalidate'");
  });

  it('fetches application bundles from the network before using an offline copy', () => {
    expect(worker).toContain("const CACHE = 'trbhh-v8'");
    expect(worker).toContain("fetch(request).then((res) => {");
    expect(worker).toContain(".catch(() => caches.match(request))");
    const staticBlock = worker.slice(worker.indexOf("if (url.pathname.startsWith('/_next/static/'))"), worker.indexOf("if (url.pathname.startsWith('/media/'))"));
    expect(staticBlock).not.toContain('caches.match(request).then((hit) => hit || fetch(request)');
  });

  it('never replaces a disconnected member navigation with a cached anonymous home page', () => {
    expect(worker).toContain("if (request.mode === 'navigate') return;");
    expect(worker).not.toContain("caches.match('/'))");
    expect(worker).not.toContain("const CORE = ['/',");
  });
});
