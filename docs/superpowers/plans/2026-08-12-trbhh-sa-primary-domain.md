# Trbhh.sa Primary Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://trbhh.sa` the preferred searchable platform URL and redirect the apex `.com` URL without changing store subdomains.

**Architecture:** A focused public-origin module supplies the canonical host. Metadata, sitemap, robots, and JSON-LD consume it. Middleware recognizes only the apex legacy host and permanently redirects it before store-subdomain routing runs.

**Tech Stack:** Next.js 16 App Router and middleware, TypeScript, Vitest.

---

### Task 1: Establish the public-origin policy

**Files:**
- Create: `src/lib/public-origin.ts`
- Create: `tests/unit/public-origin.test.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { primaryOrigin, redirectLegacyApex } from '@/lib/public-origin';

describe('public origin', () => {
  it('makes trbhh.sa the primary origin', () => {
    expect(primaryOrigin).toBe('https://trbhh.sa');
  });
  it('redirects only the .com apex to the matching Saudi URL', () => {
    expect(redirectLegacyApex('trbhh.com', '/ads/22', '?source=old')).toBe('https://trbhh.sa/ads/22?source=old');
    expect(redirectLegacyApex('store.trbhh.com', '/', '')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/public-origin.test.ts`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement the minimal policy**

```ts
export const primaryOrigin = 'https://trbhh.sa';
export function redirectLegacyApex(hostname: string, pathname: string, search: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'trbhh.com' && host !== 'www.trbhh.com') return null;
  return `${primaryOrigin}${pathname || '/'}${search}`;
}
```

Set `SITE.domain` to `trbhh.sa`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/unit/public-origin.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

Run: `git add src/lib/public-origin.ts src/lib/constants.ts tests/unit/public-origin.test.ts; git commit -m "feat: make trbhh.sa primary origin"`

### Task 2: Redirect the legacy apex before store routing

**Files:**
- Modify: `src/middleware.ts`
- Modify: `tests/unit/public-origin.test.ts`

- [ ] **Step 1: Add a failing query-string test**

```ts
it('keeps path and non-ASCII query string while redirecting', () => {
  expect(redirectLegacyApex('www.trbhh.com', '/search', '?q=معدات')).toBe('https://trbhh.sa/search?q=معدات');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/public-origin.test.ts`

Expected: fail until `www.trbhh.com` is accepted.

- [ ] **Step 3: Implement the middleware redirect**

```ts
const primary = redirectLegacyApex(req.nextUrl.hostname, req.nextUrl.pathname, req.nextUrl.search);
if (primary) return NextResponse.redirect(primary, 308);
```

Import `redirectLegacyApex` and insert this before `storeSubdomain(req.nextUrl.hostname)`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run tests/unit/public-origin.test.ts; git add src/middleware.ts tests/unit/public-origin.test.ts; git commit -m "feat: redirect legacy apex to trbhh.sa"`

Expected: 3 tests pass.

### Task 3: Emit trbhh.sa consistently to crawlers

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/robots.ts`
- Modify: `tests/unit/public-origin.test.ts`

- [ ] **Step 1: Add a failing SEO-source test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
it('uses public-origin in the sitemap and robots routes', () => {
  expect(readFileSync(resolve('src/app/sitemap.ts'), 'utf8')).toContain("from '@/lib/public-origin'");
  expect(readFileSync(resolve('src/app/robots.ts'), 'utf8')).toContain("from '@/lib/public-origin'");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/public-origin.test.ts`

Expected: fail because neither route imports the policy module.

- [ ] **Step 3: Implement SEO output**

Import `primaryOrigin` in the three routes. Use it for `metadataBase`, `alternates.canonical` on the root metadata, JSON-LD base URLs, every sitemap entry, and the robots sitemap URL.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run tests/unit/public-origin.test.ts; git add src/app/layout.tsx src/app/sitemap.ts src/app/robots.ts tests/unit/public-origin.test.ts; git commit -m "feat: publish trbhh.sa canonical SEO URLs"`

Expected: 4 tests pass.

### Task 4: Validate, back up, deploy, and request indexing

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-trbhh-sa-primary-domain-design.md`

- [ ] **Step 1: Run local verification**

Run: `pnpm test; pnpm typecheck; pnpm lint; git diff --check`

Expected: zero test failures, TypeScript errors, lint errors, and whitespace errors.

- [ ] **Step 2: Create rollback point**

Run the repository `fetch-full-backup.yml` workflow against production and wait for successful completion before pushing.

- [ ] **Step 3: Deploy the verified commit**

Push the commit to `claude/hostinger-vps-project-amw8vb` and wait for `.github/workflows/deploy.yml` to report success.

- [ ] **Step 4: Check production without writes**

```powershell
curl.exe -sS -I --max-time 20 https://trbhh.com/
curl.exe -sS -I --max-time 20 https://trbhh.sa/
curl.exe -sS --max-time 20 https://trbhh.sa/robots.txt
curl.exe -sS --max-time 20 https://trbhh.sa/sitemap.xml
```

Expected: `.com` permanently redirects to `.sa`; `.sa` returns 200; robots and sitemap reference `.sa` only.

- [ ] **Step 5: Submit in Search Console**

In the verified `trbhh.sa` property, submit `https://trbhh.sa/sitemap.xml` and request indexing for `https://trbhh.sa/`.
