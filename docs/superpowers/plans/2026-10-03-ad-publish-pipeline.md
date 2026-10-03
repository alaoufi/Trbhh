# Ad Publish Pipeline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Continue in the existing authoritative worktree; no production data cleanup.

**Goal:** Empty optional fields never obstruct publishing; every created ad has an explicit, verified destination and outcome.

**Architecture:** Repair the existing category field renderer/validator and shared AdForm. Keep the existing create transaction, moderation, package and public predicates. Add safe action results and publication outcome/trace helpers without replacing the pipeline.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/MySQL, Vitest, isolated Playwright release gate.

## 1. Optional drafts and validation
- [x] Reproduce blank range conversion using `tests/unit/ad-optional-empty.test.ts` (3 failures before implementation).
- [x] Repair `src/components/ad-category-fields.tsx` and `src/lib/ad-categories/validation.ts`: both blank endpoints omit the key, one endpoint remains an incomplete draft and is rejected explicitly; never fabricate zero. Preserve false/0.
- [x] Add required-only cases for every template/listing type in `tests/unit/ad-category-all-leaf-scenarios.test.ts`; omit all optional fields and conditional inactive values. 85 templates, validator only, NOT real database publication.
- [x] Run targeted tests, then save checkpoint `5e04cdd9`.

## 2. Safe form errors
- [x] Add typed action error state; use authoritative `CategoryValidationError.fieldKey` and messages, never raw database errors.
- [x] Repair `src/app/ads/actions.ts` and `src/components/ad-form.tsx` so rejected category submissions keep all inputs/files and focus the offending field; reuse AdCategoryFields red/error association. Real browser fixture PASS 390/1440; mocked action, no DB. React automatic reset was reproduced and fixed through manual action dispatch.
- [x] Regression-test min/max, required and quota rejection. Matrix I/J preserves the draft and focuses the required field.

## 3. Destination, trace and outcomes
- [x] Default to personal unless `dest=store` was explicitly selected. Matrix E/F/K verifies profile cookie, explicit store, and unapproved store rejection.
- [x] Record server-generated trace IDs and allowlisted stage metadata, no titles/contact/coordinates/secrets. Unit tested and 11 unique terminal trace outcomes verified in isolated CI runtime.
- [x] Resolve exactly one outcome: PUBLIC_NOW, PENDING_APPROVAL, SCHEDULED, STORE_ONLY, REJECTED. PUBLIC_NOW requires the actual shared database public predicate to match the inserted ad; mismatch is P1, never success.
- [x] Show truthful outcome and link in the post-create screen; update `/account/ads` using actual status/state/store/schedule/archive/owner-pause fields. Preserve current financial policy.
- [x] Update member/store/admin guides only for this workflow.

## Current checkpoint evidence
- App candidate `362057872642630f3dd734b15af582e2e6343213`, CI `37152844174` SUCCESS.
- 1745 unit passed / 8 skipped; 110 category MySQL tests including all 85 templates; 13 schema-family browser lifecycles; A–K 11/11.
- TypeScript, ESLint, build PASS. Independent review P2 findings fixed and re-reviewed.
- Preview workflow `37152845877` SUCCESS; external HTTP 200; read-only database.
- Release preparation `37153349662` PASS; full backup and restore verified. Release `37153493184` PASS: isolated smoke, exact-image promotion, production smoke, RELEASE_CONFIRMED.

## 4. Verification and release
- [x] Unit tests for optional untouched/cleared/false/0, partial range, required range, conditions and all 85 templates.
- [x] Isolated E2E A–K: personal, optional blank/range/condition, store profile public, explicit store, approval, scheduled, quota, field error preservation, unapproved store rejection.
- [x] For PUBLIC_NOW assert details, account state, search by title and correct category. Matrix writes isolated test data only.
- [x] TypeScript, lint, full tests, build; commit Arabic messages.
- [x] Preview and production exact candidate `362057872642630f3dd734b15af582e2e6343213`, backup and isolated gate PASS; rollback retained, not required. Production test ad 3433 removed after passing. Detailed evidence in `docs/AD-PUBLISH-PIPELINE-2026-10-03.md`; no untested historical claims.
