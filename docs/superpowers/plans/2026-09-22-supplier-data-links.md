# Supplier Data Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure supplier-facing data form with draft, submission, admin approval, revocation and reissuance, then expose store and Salla authorization links beside the approved supplier.

**Architecture:** A dedicated invitation table stores only a SHA-256 token hash plus encrypted draft data and lifecycle timestamps. Public GET/POST boundaries resolve the opaque token without creating a session, while admin server actions issue, revoke, reopen and approve submissions through the existing onboarding validation and Salla invitation services.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma raw SQL/MySQL, Node crypto, Vitest, Testing Library.

---

### Task 1: Invitation schema and cryptographic lifecycle

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/suppliers/onboarding-schema.ts`
- Create: `src/lib/suppliers/data-invitations.ts`
- Test: `tests/unit/supplier-data-invitations.test.ts`
- Modify: `tests/unit/supplier-onboarding-schema.test.ts`

- [ ] Write failing tests for 256-bit opaque tokens, hash-only persistence, seven-day expiry, one active generation per supplier, revocation, reissuance invalidation, encrypted drafts and status transitions.
- [ ] Run `pnpm vitest run tests/unit/supplier-data-invitations.test.ts tests/unit/supplier-onboarding-schema.test.ts` and confirm failures come from the missing table and module.
- [ ] Add `supplier_data_invitations` DDL/model and implement focused issue, resolve, save-draft, submit, revoke and reopen functions.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Public supplier form and HTTP boundary

**Files:**
- Create: `src/app/supplier/data/[token]/page.tsx`
- Create: `src/app/api/suppliers/data-invite/route.ts`
- Create: `src/components/supplier-data-form.tsx`
- Create: `src/lib/suppliers/data-form.ts`
- Test: `tests/unit/supplier-data-form.test.ts`
- Test: `tests/unit/supplier-data-route.test.ts`

- [ ] Write failing tests proving the page has no admin navigation/data, groups all approved onboarding fields, masks protected values, saves drafts, submits once, rejects expired/revoked/wrong tokens and rejects cross-origin POST.
- [ ] Run the two focused test files and verify the expected failures.
- [ ] Implement the form parser, public page and same-origin POST route with `noindex`, `no-store` and `Referrer-Policy: no-referrer`.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Admin review and approval

**Files:**
- Create: `src/components/supplier-data-invite-panel.tsx`
- Create: `src/app/admin/suppliers/data-actions.ts`
- Modify: `src/app/admin/suppliers/page.tsx`
- Modify: `src/lib/suppliers/onboarding-store.ts`
- Test: `tests/unit/supplier-data-admin.test.ts`
- Test: `tests/unit/supplier-data-admin-ui.test.ts`

- [ ] Write failing tests for issue/copy/open states, revoke/reissue, masked review, submitted-only approval, conflict checks, audit entries and reopen-for-correction.
- [ ] Run the focused tests and verify the missing admin behavior fails.
- [ ] Implement admin actions and panel, reusing `inspectOnboarding`, `saveOnboarding`, permission checks and audit logging.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Store and Salla links after approval

**Files:**
- Modify: `src/app/admin/suppliers/page.tsx`
- Modify: `src/components/supplier-owner-invite-button.tsx`
- Test: `tests/unit/supplier-data-admin-ui.test.ts`
- Test: `tests/unit/supplier-owner-invite-button.test.ts`

- [ ] Add failing UI tests requiring open/copy store link and the existing Salla authorization controls only after approved onboarding, with connected stores reported without generating a new OAuth link.
- [ ] Run the focused tests and verify they fail for missing placement.
- [ ] Render approved store controls and reuse the existing Salla invite component without changing OAuth, Callback or Webhook behavior.
- [ ] Run focused tests and confirm they pass.

### Task 5: Preserve Excel fallback and verify the complete change

**Files:**
- Modify: `src/components/supplier-onboarding.tsx`
- Modify: `src/app/admin/suppliers/onboarding/page.tsx`
- Test: `tests/unit/supplier-onboarding-ui.test.ts`

- [ ] Write a failing test requiring the online data link to be presented as the primary path and Excel to remain explicitly available as an optional fallback.
- [ ] Update the admin copy and navigation without removing workbook parsing or upload endpoints.
- [ ] Run all supplier-focused tests.
- [ ] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`.
- [ ] Review the diff for OAuth/Callback/Webhook changes and verify `SUPPLIER_ALLOW_LIVE_ORDERS=false` remains enforced.
- [ ] Commit and push only `codex/supplier-data-links-20260922`; do not update the production branch.
