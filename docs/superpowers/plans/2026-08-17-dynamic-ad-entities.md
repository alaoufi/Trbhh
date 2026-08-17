# Dynamic Ad Entities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a hidden, authorised dynamic-entity advertising lab without changing current public advertisements.

**Architecture:** New independent MySQL tables hold dynamic schemas, drafts, normalised values and feedback.  A local deterministic analyser creates advisory results.  Server-side lab routes are guarded, noindexed, and feature-flagged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/MySQL, Zod, Vitest, Tailwind RTL.

---

### Task 1: Dynamic schema bootstrap

**Files:**
- Create: `database/2026-08-17-dynamic-ads.sql`
- Create: `src/lib/dynamic-ads/schema.ts`
- Test: `tests/unit/dynamic-ad-schema.test.ts`

- [ ] Write failing tests for required field validation, known seed keys, and idempotent SQL table creation markers.
- [ ] Run `npm.cmd test -- --run tests/unit/dynamic-ad-schema.test.ts` and confirm failure.
- [ ] Add unsigned IDs, foreign keys, unique entity/field keys, entity/value indexes, and SQL seed upserts for the seven initial entities.
- [ ] Implement typed field definitions and Zod validation using only field definitions retrieved from the database.
- [ ] Re-run the test and commit `feat: add dynamic advertisement schema`.

### Task 2: Repository and analysis engine

**Files:**
- Create: `src/lib/dynamic-ads/repository.ts`
- Create: `src/lib/dynamic-ads/analyser.ts`
- Create: `src/lib/dynamic-ads/types.ts`
- Test: `tests/unit/dynamic-ad-analyser.test.ts`

- [ ] Write failing tests: “جيب لكزس 2020 فل كامل ممشى 80” detects vehicle, extracts 2020 and 80000; area/rooms detects property; حري detects livestock; same fingerprint is reusable.
- [ ] Run the analyser tests and confirm failure.
- [ ] Implement tokenisation, weighted rules, confidence, extraction, required-field omissions, quality scoring, and SHA-256 fingerprint caching.
- [ ] Implement database reads/writes using parameterised Prisma `$queryRaw`/`$executeRaw` only and whitelist sortable/filterable fields.
- [ ] Re-run tests and commit `feat: add dynamic ad analysis engine`.

### Task 3: Feature gate and hidden routes

**Files:**
- Create: `src/lib/dynamic-ads/access.ts`
- Create: `src/app/lab/smart-ads/page.tsx`
- Create: `src/app/lab/smart-ads/[id]/analyze/page.tsx`
- Create: `src/app/lab/smart-ads/actions.ts`
- Test: `tests/unit/dynamic-ad-access.test.ts`

- [ ] Write failing tests for disabled flag, unauthorised visitor 404 behaviour, and administrator access.
- [ ] Implement `smart_ads_lab_enabled` defaulting to false; require a session and explicit permitted user/admin, return `notFound()` otherwise, and set robots noindex/nofollow.
- [ ] Implement draft creation and analysis actions that never call `createAdAction`, wallet, image storage, or public cache invalidation.
- [ ] Re-run focused tests and commit `feat: add hidden smart ads lab`.

### Task 4: Mobile RTL schema-driven form and analyser view

**Files:**
- Create: `src/components/dynamic-ads/dynamic-ad-form.tsx`
- Create: `src/components/dynamic-ads/analysis-report.tsx`
- Modify: `src/app/lab/smart-ads/page.tsx`
- Test: `tests/unit/dynamic-ad-form-contract.test.ts`

- [ ] Write a failing form contract test asserting the seven entity choices, auto-detect option, and rendering of text/select/number/boolean/location fields.
- [ ] Implement responsive RTL form, only one primary action, progressive entity fields, and a non-public preview.
- [ ] Implement report cards for entity/confidence/extractions/missing fields/quality/suggestions and a user confirmation/correction control.
- [ ] Re-run tests and typecheck; commit `feat: add smart ad lab form and analysis report`.

### Task 5: Admin management and lab search

**Files:**
- Create: `src/app/admin/smart-ads/page.tsx`
- Create: `src/app/admin/smart-ads/actions.ts`
- Create: `src/app/lab/smart-ads/search/page.tsx`
- Modify: `src/components/admin-nav-def.ts`
- Test: `tests/unit/dynamic-ad-search.test.ts`

- [ ] Write failing tests for searchable field filtering and no cross-entity values.
- [ ] Add protected admin tabs for queue, incomplete, ready, entities, fields, rules and feedback; add entity/field create/update toggles with schema validation.
- [ ] Add hidden, paginated entity/value/text search and accuracy statistics calculated from explicit corrections.
- [ ] Re-run focused tests and commit `feat: add dynamic ads administration and lab search`.

### Task 6: Migration, verification, and hidden rollout

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Test: all dynamic-ad tests plus `npm.cmd run typecheck`

- [ ] Add an idempotent pre-start schema bootstrap command that fails closed before the app restarts; it may not expose the lab setting.
- [ ] Document enable/disable, authorised tester configuration, backup, rollback SHA, and the explicit rule that pilot records never publish publicly.
- [ ] Run all dynamic-ad tests, typecheck, lint, build, and a database bootstrap smoke test.
- [ ] Create full backup, deploy with `smart_ads_lab_enabled=0`, health-check public add-ad flow, then enable only for the authenticated pilot tester.
- [ ] Commit `feat: ship hidden dynamic ads pilot` and record rollback evidence.
