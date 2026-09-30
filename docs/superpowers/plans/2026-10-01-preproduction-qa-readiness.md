# Trbhh Pre-production QA and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** إغلاق أعطال P0/P1 في نسخة المعاينة، وتوثيق جودة البيانات القديمة، وإثبات أن التصنيفات والحقول والبحث والإنشاء والتعديل آمنة قبل أي نقل للإنتاج.

**Architecture:** نحافظ على محرك `ad-categories` الحالي كمصدر الحقيقة، ونضيف تحققًا خالصًا قابلًا للاختبار للأسعار والموقع والوحدات، ثم نستخدمه من Server Actions والبحث والعرض. تدقيق البيانات القديمة قراءة فقط ويصدر تصنيفًا إحصائيًا دون تعديل السجلات، بينما اختبارات الكتابة تعمل على MySQL معزولة فقط.

**Tech Stack:** Next.js App Router، TypeScript، Prisma/MySQL، Vitest، Playwright، GitHub Actions، Docker Compose على Hostinger.

---

### Task 1: Canonical units, numeric bounds, and read-only data audit

**Files:**
- Modify: `src/lib/ad-categories/validation.ts`
- Modify: `src/lib/ad-categories/seed-templates.ts`
- Modify: `src/components/ad-category-fields.tsx`
- Modify: `src/components/ad-category-editor.tsx`
- Create: `src/lib/ad-quality/audit.ts`
- Create: `scripts/release/audit-live-ad-quality.cjs`
- Test: `tests/unit/ad-category-validation.test.ts`
- Test: `tests/unit/ad-category-seeds.test.ts`
- Test: `tests/unit/ad-quality-audit.test.ts`

- [ ] **Step 1: Write failing tests for step, canonical units, and audit classification**

```ts
expect(() => validateCategoryValues([numeric({ step: 0.5 })], { capacity: 1.2 })).toThrow('قيمة غير صالحة');
expect(validateDefinition([numeric({ unit: 'طن', step: 0.1 })])[0]).toMatchObject({ unit: 'طن', step: 0.1 });
expect(auditAdQuality(impossibleLiftFixture)).toContainEqual(expect.objectContaining({ severity: 'INVALID_BUT_PRESERVE' }));
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `pnpm exec vitest run tests/unit/ad-category-validation.test.ts tests/unit/ad-category-seeds.test.ts tests/unit/ad-quality-audit.test.ts`

Expected: failure because `step` and `auditAdQuality` are not implemented.

- [ ] **Step 3: Implement minimal canonical validation and read-only audit**

```ts
export const CANONICAL_UNITS = ['كجم','طن','كم','ساعة','كيلوواط','حصان','متر','م²','لتر','سم','يوم'] as const;
export type CategoryField = { /* existing fields */ step?: number };
```

The audit must return only `AUTO_FIX_SAFE`, `NEEDS_REVIEW`, or `INVALID_BUT_PRESERVE`; it must not execute `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, migrations, or seeds.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `pnpm exec vitest run tests/unit/ad-category-validation.test.ts tests/unit/ad-category-seeds.test.ts tests/unit/ad-quality-audit.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ad-categories src/components/ad-category-fields.tsx src/components/ad-category-editor.tsx src/lib/ad-quality scripts/release/audit-live-ad-quality.cjs tests/unit
git commit -m "إضافة تدقيق جودة البيانات والتحقق العددي"
```

### Task 2: Pricing and Saudi location invariants

**Files:**
- Create: `src/lib/ads/submission-validation.ts`
- Modify: `src/app/ads/actions.ts`
- Modify: `src/components/ad-form.tsx`
- Modify: `src/lib/data.ts`
- Test: `tests/unit/ad-submission-validation.test.ts`
- Test: `tests/unit/ad-actions-category.test.ts`
- Test: `tests/unit/deals.test.ts`

- [ ] **Step 1: Write failing tests for current/old price and region-city relationship**

```ts
expect(() => normalizeAdPricing({ price: '0', oldPrice: '', pricingMode: 'fixed' })).toThrow('أكبر من صفر');
expect(() => normalizeAdPricing({ price: '100', oldPrice: '90', pricingMode: 'fixed' })).toThrow('السعر السابق');
await expect(validateSaudiLocation(adapter, { regionId: 1, cityId: 99 })).rejects.toThrow('لا تتبع المنطقة');
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `pnpm exec vitest run tests/unit/ad-submission-validation.test.ts tests/unit/ad-actions-category.test.ts tests/unit/deals.test.ts`

- [ ] **Step 3: Implement server-side pricing and location validation**

```ts
export type NormalizedAdPricing = { price: number; oldPrice: number; discountPercent: number | null; warning: string | null };
export async function validateSaudiLocation(db: LocationReader, input: { regionId: number; cityId: number | null }) { /* verify existing Saudi hierarchy */ }
```

Use the existing `cities` table as region and `areas` table as city; do not create a second dataset. Calculate discount on the server and never trust a submitted percentage.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `pnpm exec vitest run tests/unit/ad-submission-validation.test.ts tests/unit/ad-actions-category.test.ts tests/unit/deals.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/ads src/app/ads/actions.ts src/components/ad-form.tsx src/lib/data.ts tests/unit
git commit -m "إصلاح تحقق الأسعار والموقع الجغرافي"
```

### Task 3: Dynamic filters, deals, nearby, and similar ads

**Files:**
- Modify: `src/lib/search-filters.ts`
- Modify: `src/app/search/page.tsx`
- Modify: `src/components/public-search-form.tsx`
- Modify: `src/lib/data.ts`
- Modify: `src/app/deals/page.tsx`
- Modify: `src/app/nearby/page.tsx`
- Test: `tests/unit/public-search-query.test.ts`
- Test: `tests/unit/public-discovery.test.ts`
- Test: `tests/unit/similar-ads.test.ts`
- Test: `tests/unit/deals.test.ts`

- [ ] **Step 1: Write failing tests for leaf filters and relevance ordering**

```ts
expect(normalizeCategoryAttributeFilters(fields, { attr_capacity_min: '2' }, 'rent').filters).toEqual([expect.objectContaining({ key: 'capacity', min: 2 })]);
expect(similarOrder[0]).toMatchObject({ subcategoryId: source.subcategoryId });
expect(isValidDeal({ price: 100, oldPrice: 90, priceType: 'sale' })).toBe(false);
```

- [ ] **Step 2: Verify RED, implement server-side behavior, then verify GREEN**

Run before and after implementation: `pnpm exec vitest run tests/unit/public-search-query.test.ts tests/unit/public-discovery.test.ts tests/unit/similar-ads.test.ts tests/unit/deals.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/search-filters.ts src/app/search src/components/public-search-form.tsx src/lib/data.ts src/app/deals src/app/nearby tests/unit
git commit -m "إكمال الفلاتر الديناميكية وترتيب الاكتشاف"
```

### Task 4: Canonical taxonomy across homepage, forms, search, and admin

**Files:**
- Modify: `src/lib/ad-categories/taxonomy.ts`
- Modify: `src/lib/ad-categories/service.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/home-category-navigation.tsx`
- Modify: `src/components/ad-form.tsx`
- Modify: `src/app/admin/categories/page.tsx`
- Test: `tests/unit/ad-category-public-taxonomy.test.ts`
- Test: `tests/unit/home-category-page.test.ts`
- Test: `tests/unit/ad-category-all-leaf-scenarios.test.ts`

- [ ] **Step 1: Add a failing source-identity regression test**

```ts
expect(homeTaxonomy.subcategories.map(x => x.id)).toEqual(formTaxonomy.subcategories.map(x => x.id));
expect(searchTaxonomy.groups).toEqual(homeTaxonomy.groups);
```

- [ ] **Step 2: Verify RED if any consumer diverges, then route all public consumers through `buildPublicCategoryTaxonomy`**

Run: `pnpm exec vitest run tests/unit/ad-category-public-taxonomy.test.ts tests/unit/home-category-page.test.ts tests/unit/ad-category-all-leaf-scenarios.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/ad-categories src/app/page.tsx src/components/home-category-navigation.tsx src/components/ad-form.tsx src/app/admin/categories/page.tsx tests/unit
git commit -m "توحيد مصدر التصنيفات في الواجهات العامة والإدارة"
```

### Task 5: Authenticated create/edit regression on isolated MySQL

**Files:**
- Modify: `tests/preview/setup.test.ts`
- Modify: `tests/preview/browser.cjs`
- Create: `tests/integration/ad-create-edit-mysql.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `src/app/ads/[id]/edit/page.tsx`
- Modify: `src/components/ad-form.tsx`

- [ ] **Step 1: Add failing isolated tests for ownership, create, edit, category change, and preservation**

```ts
expect(await attemptEdit(otherMember, ad.id)).toMatchObject({ forbidden: true });
expect(await loadSavedAd(owner, ad.id)).toMatchObject({ listingType: 'rent', categoryValues: expect.any(Object) });
```

- [ ] **Step 2: Run integration test against the disposable loopback database and verify RED**

Run: `pnpm exec vitest run tests/integration/ad-create-edit-mysql.test.ts --maxWorkers=1`

Expected: the new assertions expose any missing invariant without touching production.

- [ ] **Step 3: Implement the smallest fixes and extend Playwright across 360, 390, 412, 768, 1024, and 1440**

The browser run must cover login/logout, create/edit/search/details and admin access using synthetic accounts only. External requests are aborted and payments/supplier orders remain disabled.

- [ ] **Step 4: Commit**

```bash
git add tests/preview tests/integration .github/workflows/ci.yml src/app/ads src/components/ad-form.tsx
git commit -m "تثبيت مسارات الدخول وإنشاء وتعديل الإعلان"
```

### Task 6: Security, preview SEO, public pages, and error behavior

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/robots.ts`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/site-map/page.tsx`
- Modify: `tests/unit/live-readonly-preview.test.ts`
- Create: `tests/unit/preproduction-security.test.ts`
- Modify: `tests/preview/browser.cjs`

- [ ] **Step 1: Write failing tests for preview noindex and guard invariants**

```ts
expect(previewHeaders.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
expect(readOnlyPreviewResponse('POST', '/ads/new')?.status).toBe(405);
expect(publicErrorText).not.toMatch(/DATABASE_URL|PrismaClient|at .*src\//);
```

- [ ] **Step 2: Verify RED, add preview-only noindex and public-route checks, then verify GREEN**

Run: `pnpm exec vitest run tests/unit/live-readonly-preview.test.ts tests/unit/preproduction-security.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts src/app/robots.ts src/app/sitemap.ts src/app/site-map tests/unit tests/preview/browser.cjs
git commit -m "تقوية أمان المعاينة وصفحاتها العامة"
```

### Task 7: Final preview evidence and release gate

**Files:**
- Modify: `.github/workflows/deploy-staging.yml`
- Create: `docs/PREPRODUCTION-READINESS-2026-10-01.md`
- Modify: `دليل-المطور.md`
- Modify: `src/app/guide/page.tsx`
- Modify: `src/app/guide/store/page.tsx`
- Modify: `src/app/admin/guide/page.tsx`

- [ ] **Step 1: Add safe audit execution to the read-only preview workflow**

```bash
docker exec "$container" node scripts/release/audit-live-ad-quality.cjs --json > /tmp/ad-quality.json
```

The workflow verifies grants are read-only before running the audit and never runs migrations or seeds in live-readonly mode.

- [ ] **Step 2: Run all gates**

Run:

```bash
pnpm prisma validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: exit code 0 for every command; lint may retain only documented pre-existing warnings.

- [ ] **Step 3: Push branch, wait for CI, deploy preview only, and run browser/audit checks**

```bash
git push origin codex/trbhh-platform-enhancement-20260929
gh workflow run deploy-staging.yml --ref codex/trbhh-platform-enhancement-20260929 -f live_read_only=true
```

Expected: preview returns HTTP 200, `X-Trbhh-Preview-Mode: read-only`, `X-Robots-Tag: noindex, nofollow, noarchive`, and no write-capable DB grants.

- [ ] **Step 4: Record exact counts and classify release gate**

The report records main/sub/leaf counts, tested leaf count, audit classifications, P0/P1/P2/P3, test/account scenarios, commits, deployment order, backup, smoke test, and rollback. `READY FOR PRODUCTION` is allowed only when P0=0 and P1=0.

- [ ] **Step 5: Final cleanup commit**

```bash
git add docs دليل-المطور.md src/app/guide src/app/admin/guide .github/workflows/deploy-staging.yml
git commit -m "إكمال تنظيف وجاهزية ما قبل الإنتاج"
```

## Self-review

- Spec coverage: taxonomy, every leaf schema, numeric/unit validation, pricing, location, data audit, dynamic filters, home/cards, details/similar/nearby/deals, authenticated create/edit, responsive/public/error/security/SEO/performance/logs, gates and rollback are mapped above.
- Placeholder scan: the plan contains no deferred implementation placeholder; all blocked write scenarios use an isolated database rather than production.
- Type consistency: `CategoryField.step`, `NormalizedAdPricing`, audit classifications, and existing `buildPublicCategoryTaxonomy` are used consistently across tasks.
