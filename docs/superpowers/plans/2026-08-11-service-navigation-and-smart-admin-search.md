# Service Navigation and Smart Admin Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Trbhh admin and member service discoverable by its title or common Arabic terms, with specialist-oriented menus and permission-safe direct links.

**Architecture:** Keep routes and authority unchanged; centralize service metadata beside the existing admin navigation definition. Use that metadata both to render grouped menus and to show permission-filtered service results before database results in `/admin/search`.

**Tech Stack:** Next.js App Router, TypeScript, React, Vitest.

---

### Task 1: Service catalog and financial direct links

**Files:**
- Modify: `src/components/admin-nav-def.ts`
- Modify: `src/app/admin/layout.tsx`
- Test: `tests/unit/admin-service-catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(source).toContain("href: '/admin/revenue?tab=accounts'");
expect(source).toContain("label: 'حسابات الشحن البنكية'");
expect(source).toContain("keywords: ['الحساب البنكي', 'آيبان', 'بيانات التحويل']");
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node_modules/.bin/vitest.cmd run tests/unit/admin-service-catalog.test.ts`  
Expected: FAIL because the service catalog and direct link are absent.

- [ ] **Step 3: Implement central metadata**

Extend `AdminNavItem` with `description` and `keywords`. Add the direct account link under money, move promotional ads under content/marketing, and give each financial destination a non-duplicated label. Keep `perm` unchanged and make `admin/layout.tsx` filter the extended items using the existing permission set.

- [ ] **Step 4: Verify and commit**

Run: `node_modules/.bin/vitest.cmd run tests/unit/admin-service-catalog.test.ts`  
Expected: PASS.

Commit: `git add src/components/admin-nav-def.ts src/app/admin/layout.tsx tests/unit/admin-service-catalog.test.ts && git commit -m "تنظيم خدمات الإدارة المالية"`

### Task 2: Permission-safe service search

**Files:**
- Modify: `src/app/admin/search/page.tsx`
- Modify: `src/components/header-search.tsx`
- Create: `src/lib/admin-service-search.ts`
- Test: `tests/unit/admin-service-search.test.ts`

- [ ] **Step 1: Write failing search tests**

```ts
expect(findAdminServices('آيبان', new Set(['users']))[0]?.href).toBe('/admin/revenue?tab=accounts');
expect(findAdminServices('آيبان', new Set(['ads']))).toEqual([]);
expect(findAdminServices('رسوم تحويل', new Set(['users']))[0]?.label).toContain('التحويلات');
```

- [ ] **Step 2: Run and confirm failure**

Run: `node_modules/.bin/vitest.cmd run tests/unit/admin-service-search.test.ts`  
Expected: FAIL because the search module does not exist.

- [ ] **Step 3: Implement normalized matching**

Implement Arabic normalization (trim, lower case, normalize alef/taa marbuta) and match query tokens against label, description, and keywords from `ADMIN_NAV`. Filter first by the existing page-level `perm`; render service results above member/ad/store results with their administrative path and direct link. Update the header placeholder to include services and settings.

- [ ] **Step 4: Verify and commit**

Run: `node_modules/.bin/vitest.cmd run tests/unit/admin-service-search.test.ts`  
Expected: PASS.

Commit: `git add src/app/admin/search/page.tsx src/components/header-search.tsx src/lib/admin-service-search.ts tests/unit/admin-service-search.test.ts && git commit -m "إضافة بحث ذكي لخدمات الإدارة"`

### Task 3: Member navigation by specialty

**Files:**
- Modify: `src/app/account/layout.tsx`
- Test: `tests/unit/member-service-navigation.test.ts`

- [ ] **Step 1: Write the failing navigation contract**

```ts
expect(source).toContain('الحساب والهويات');
expect(source).toContain('الإعلانات والمتجر');
expect(source).toContain('المحفظة والمدفوعات');
expect(source).toContain("href: '/account/wallet'");
```

- [ ] **Step 2: Run and confirm failure**

Run: `node_modules/.bin/vitest.cmd run tests/unit/member-service-navigation.test.ts`  
Expected: FAIL because the navigation has one flat list.

- [ ] **Step 3: Render explicit groups without changing URLs**

Replace the flat member list with grouped metadata while retaining every existing route, access check, and mobile scroller behavior. Keep unavailable future payment features out of the menu until implemented.

- [ ] **Step 4: Verify and commit**

Run: `node_modules/.bin/vitest.cmd run tests/unit/member-service-navigation.test.ts`  
Expected: PASS.

Commit: `git add src/app/account/layout.tsx tests/unit/member-service-navigation.test.ts && git commit -m "ترتيب خدمات العضو حسب التخصص"`

### Task 4: Regression verification and safe release

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-service-navigation-and-smart-admin-search-design.md` only if verification changes an acceptance criterion.

- [ ] **Step 1: Run local checks**

Run: `node_modules/.bin/vitest.cmd run tests/unit/admin-service-catalog.test.ts tests/unit/admin-service-search.test.ts tests/unit/member-service-navigation.test.ts`  
Expected: PASS.

Run: `node_modules/.bin/tsc.cmd --noEmit`  
Expected: exit code 0.

Run: `git diff --check`  
Expected: no output.

- [ ] **Step 2: Deploy safely**

After the complete wallet branch passes its own tests, run the Trbhh-only full backup workflow, record the rollback commit, deploy only the Trbhh branch, and verify `/admin/search?q=آيبان` while logged in with an authorized test account. Do not touch Agar.
