# Salla Integration Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with test-first implementation and independent specification/quality reviews. No live deployment or real orders.

**Goal:** Implement the user's Salla Custom Authentication supplier workflow on the existing commerce foundation.

**Architecture:** Separate imported catalog and provider connections from sellable commerce products. Existing paid receipts drive supplier fulfillment; independent durable claims protect tokens, jobs and outbound orders.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Node crypto/fetch, Vitest/Playwright.

## Execution status — local test release

Phases 1–5 implemented and reviewed. Phase6 implements exact reservation/cost snapshots and paid-receipt-gated terminal simulation; real Salla POST remains intentionally blocked because the documented create contract requires merchant-specific customer/shipping/payment decisions absent from the current checkout. Phase7 signed inbox/retries/reconciliation/tracking implemented. Phase8 unit/MySQL/legacy-upgrade/typecheck/lint/build passed; browser execution was blocked by the host execution policy. No real Salla OAuth has been attempted without the user's securely configured app secrets/demo store. No production deployment or Salla submission.

Checklist items below are the original detailed acceptance scope; outstanding live/demo/browser portions are not silently marked complete. See `docs/SALLA-INTEGRATION.md` for exact implemented capabilities, safeguards, limitations and manual handoff.

## 1. Repository audit

- [x] Resolve authoritative checkout, read developer guide and current supplier/order/payment/auth/schema modules; verify production deployment boundary.
- [x] Run baseline `node node_modules/vitest/vitest.mjs run`: 635 passed, 8 opt-in skipped.
- [x] Read official Salla authorization/webhook docs; verify resource endpoint contracts before their implementation.

## 2. Generic layer and pricing

Files: `src/lib/suppliers/{types,schema,pricing}.ts`, `prisma/schema.prisma`, `src/data/schema-sync.ts`; tests `tests/unit/supplier-integration-{schema,pricing}.test.ts`.

- [ ] RED: provider enum, independent controls, schema unique keys, `50/40/47 SAR => 7 SAR` profit, fixed/percentage/manual policies, invalid currencies/overflow and min-margin boundaries.
- [ ] Implement additive persistence and provider DTOs with explicit secret-free projections. Pricing uses integer halalas, percentage basis points and deliberate application, never implicit sync updates.
- [ ] Generate Prisma and run focused tests/typecheck; spec review then quality review.

## 3. Salla OAuth

Files: `src/lib/suppliers/{config,crypto,oauth,connections}.ts`, `providers/salla.ts`; `src/app/api/integrations/salla/callback/route.ts`.

- [ ] RED: missing config, forged/replayed/expired/cross-admin state, authenticated merchant uniqueness, encrypted token roundtrip/wrong context, single-use refresh concurrency and uncertain refresh outcome.
- [ ] Implement server-only OAuth and fixed-host HTTP adapter with timeout/body bounds/no redirects. Persist durable claims before network calls; no secret logging.
- [ ] Wire admin start/disconnect and callback using existing RBAC/session. Callback returns only sanitized redirect/error codes.

## 4. Product synchronization

Files: `src/lib/suppliers/{catalog,sync}.ts`, provider mapping and tests.

- [ ] RED: paginated catalog mapping, variants/options/images, SAR-only price validation, repeated imports, inactive/hidden default, admin override preservation, disabled supplier/maintenance/sync gate, failed/partial pages.
- [ ] Implement bounded progress, source-only upsert and last-sync/error tracking. No automatic publish or final-price overwrite.

## 5. Admin and explicit pricing/publishing

Files: `src/app/admin/suppliers/integrations/{page,actions}.tsx/ts`, supplier navigation, supplier product detail controls, `src/lib/suppliers/admin.ts`.

- [ ] RED: RBAC before reads/writes, strict form parsing, no secret props, price history, explicit publication, independent visibility/enabled/featured, maintenance and reconnect behavior.
- [ ] Reuse original card/form styles and existing commerce approved-product mapping. Imported catalog paginates. Add manual sync, connect/disconnect, tiers and reservation controls.

## 6. Orders and reserved quantities

Files: `src/lib/suppliers/{reservations,orders}.ts`, narrow hooks in `src/lib/commerce/orders.ts` and isolated MySQL tests.

- [ ] RED: reserve/consume/release exactly once, insufficient/concurrent quantities, correct next-tier/normal fallback, immutable negotiated-cost snapshot, no dispatch before verified receipt, supplier/product disabled, duplicate claims and ambiguous upstream outcome.
- [ ] Implement atomic allocation and paid-order dispatch from existing snapshots. Development simulator is default; real order network transport is separately gated and never executed in tests.

## 7. Webhooks, reconciliation and tracking

Files: `src/lib/suppliers/{webhooks,worker,tracking}.ts`, `/api/integrations/salla/webhooks`, authenticated `/api/internal/suppliers/reconcile`, member order tracking projection.

- [ ] RED: raw signature mismatch, malformed/oversized event, duplicate/replay, merchant isolation, retry/backoff, stale event, missed event reconciliation, owner-only shipment and notification deduplication.
- [ ] Implement durable inbox, bounded processing and explicit cron authorization. Re-fetch authoritative resource state; never accept a webhook as bank proof. Preserve supplier identity/cost privacy.

## 8. Verification and handoff

Files: `.env.example`, `docker-compose.yml`, `docs/SALLA-INTEGRATION.md`, existing three guides.

- [ ] Document exact implemented endpoint paths, environment names without values, demo-store procedure, scheduler setup and rollback/deployment prerequisites.
- [ ] Run Prisma validation/generation, all unit and isolated MySQL integration tests, typecheck, lint, build, and local admin/member browser verification.
- [ ] Independent final security/spec review, repair findings, rerun relevant tests. Report actual results and remaining manual demo-store/configuration steps; no real purchases or Salla submission.
