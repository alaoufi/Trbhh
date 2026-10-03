# Ad Publish Pipeline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Continue in the existing authoritative worktree; no production data cleanup.

**Goal:** Empty optional fields never obstruct publishing; every created ad has an explicit, verified destination and outcome.

**Architecture:** Repair the existing category field renderer/validator and shared AdForm. Keep the existing create transaction, moderation, package and public predicates. Add safe action results and publication outcome/trace helpers without replacing the pipeline.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/MySQL, Vitest, isolated Playwright release gate.

## 1. Optional drafts and validation
- [x] Reproduce blank range conversion using `tests/unit/ad-optional-empty.test.ts` (3 failures before implementation).
- [ ] Repair `src/components/ad-category-fields.tsx` and `src/lib/ad-categories/validation.ts`: both blank endpoints omit the key, one endpoint remains an incomplete draft and is rejected explicitly; never fabricate zero. Preserve false/0.
- [ ] Add required-only cases for every template/listing type in `tests/unit/ad-category-all-leaf-scenarios.test.ts`; omit all optional fields and conditional inactive values.
- [ ] Run `pnpm exec vitest run tests/unit/ad-optional-empty.test.ts tests/unit/ad-category-all-leaf-scenarios.test.ts`, then save a checkpoint.

## 2. Safe form errors
- [ ] Add typed action error state; use authoritative `CategoryValidationError.fieldKey` and messages, never raw database errors.
- [ ] Repair `src/app/ads/actions.ts` and `src/components/ad-form.tsx` so rejected category submissions keep all inputs/files and focus the offending field; reuse AdCategoryFields red/error association.
- [ ] Regression-test min/max, required and quota rejection. No redirect that discards a draft for these errors.

## 3. Destination, trace and outcomes
- [ ] Reproduce active-store cookie preselect in `src/app/ads/new/page.tsx`; default to personal unless `dest=store` was explicitly selected. Server verifies store ownership/availability.
- [ ] Record server-generated trace IDs and allowlisted stage metadata, no titles/contact/coordinates/secrets.
- [ ] Resolve exactly one outcome: PUBLIC_NOW, PENDING_APPROVAL, SCHEDULED, STORE_ONLY, REJECTED. PUBLIC_NOW requires the actual shared database public predicate to match the inserted ad; mismatch is P1, never success.
- [ ] Show truthful outcome and link in the post-create screen; update `/account/ads` using actual status/state/store/schedule/archive/owner-pause fields. Preserve current financial policy.
- [ ] Update member/store/admin guides only for this workflow.

## 4. Verification and release
- [ ] Unit tests for optional untouched/cleared/false/0, partial range, required range, conditions and all 85+ leaf schemas.
- [ ] Isolated E2E A–J: personal, optional blank/range/condition, store profile public, explicit store, approval, scheduled, quota, field error preservation.
- [ ] For PUBLIC_NOW assert details, account state, search by title and correct category. Never write these tests to production data.
- [ ] TypeScript, lint, full tests, build; commit Arabic messages.
- [ ] Preview exact candidate, backup and isolated gate; retain rollback. Record proven results and unknowns; no unsupported 100% claim.
