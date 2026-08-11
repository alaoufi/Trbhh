# Al Rajhi Payment Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Trbhh-only, safe two-method wallet top-up system, ready for the bank-certified Al Rajhi hosted-checkout adapter.

**Architecture:** Keep manual bank transfer and electronic payment as distinct methods over the existing wallet ledger. Environment-only Al Rajhi credentials feed one provider adapter; database settings hold only the two administration switches and transfer-bank accounts. Callback crediting remains a single MySQL transaction guarded by unique references and conditional state transitions.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 6, MySQL, Vitest, existing Trbhh wallet and roles.

---

### Task 1: Environment and two-method configuration

**Files:**
- Create: `.env.example`
- Modify: `src/lib/payments/config.ts`
- Modify: `src/lib/settings.ts`
- Test: `tests/unit/payment-method-settings.test.ts`

- [ ] Write tests proving both methods default to disabled, are independently enabled, and an electronic method is unavailable when Al Rajhi environment values are incomplete.
- [ ] Run `pnpm vitest run tests/unit/payment-method-settings.test.ts` and confirm the tests fail before the configuration exists.
- [ ] Add environment parsing that rejects missing/invalid production Al Rajhi configuration; add the two non-secret settings flags and getters/setters; document all listed environment names in `.env.example` with empty values.
- [ ] Run the focused test and commit `feat: add payment method activation controls`.

### Task 2: Reconcile payment request data safely

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/data/schema-sync.ts`
- Modify: `src/lib/wallet.ts`
- Test: `tests/unit/payment-topup-schema.test.ts`

- [ ] Write tests requiring unique opaque `transaction_id`, unique `idempotency_key`, currency, encrypted response, callback fingerprint, verified timestamp, and failure reason on online top-ups.
- [ ] Run the focused test and confirm it fails.
- [ ] Add matching Prisma fields and idempotent schema-sync DDL/indexes; generate IDs with `crypto.randomUUID`; update online top-up creation to preserve the manual-transfer path.
- [ ] Run the focused test and `prisma validate`; commit `feat: add reconciled online topup records`.

### Task 3: Atomic ledger and payment service

**Files:**
- Create: `src/lib/payments/payment-service.ts`
- Modify: `src/lib/payments/types.ts`
- Modify: `src/lib/payments/index.ts`
- Modify: `src/lib/wallet.ts`
- Test: `tests/unit/payment-service.test.ts`

- [ ] Write tests for successful one-time credit, duplicate callback, amount/currency mismatch, provider timeout, and unverified payment.
- [ ] Run the focused test and confirm it fails.
- [ ] Implement `createPayment`, `verifyPayment`, `handleCallback`, and `refundPayment`; ensure state update, balance update, and `wallet_txns` write use one MySQL transaction and an idempotent conditional update.
- [ ] Run focused tests and commit `feat: add atomic wallet payment service`.

### Task 4: Al Rajhi contract adapter and callback

**Files:**
- Create: `src/lib/payments/providers/alrajhi.ts`
- Modify: `src/lib/payments/registry.ts`
- Modify: `src/app/api/pay/callback/[provider]/route.ts`
- Modify: `src/app/api/pay/webhook/[provider]/route.ts`
- Test: `tests/unit/alrajhi-provider.test.ts`

- [ ] Write tests from the bank-issued merchant integration guide for the exact hosted-checkout request, callback signed fields/header, timestamp/replay handling, server verification, success, decline, and refund response mapping.
- [ ] Run the focused test and confirm it fails.
- [ ] Implement the adapter against that exact issued contract, including signature verification before a bank query. Do not select endpoints, signed fields, or signature algorithms from guesses or third-party examples.
- [ ] Run focused tests with bank sandbox fixtures and commit `feat: integrate certified Al Rajhi checkout`.

### Task 5: Arabic member and administration experience

**Files:**
- Modify: `src/app/account/wallet/page.tsx`
- Modify: `src/app/account/actions.ts`
- Create: `src/app/payment/success/page.tsx`
- Create: `src/app/payment/failed/page.tsx`
- Modify: `src/app/admin/payments/page.tsx`
- Modify: `src/app/admin/actions.ts`
- Test: `tests/unit/payment-pages.test.ts`

- [ ] Write tests for method visibility, disabled-method rejection, Arabic success/failure data, and staff-only recheck.
- [ ] Run the focused test and confirm it fails.
- [ ] Render the two methods using Trbhh styles, retain transfer receipt submission, add secure hosted-checkout redirect and result pages, and add payment search/filter/recheck controls.
- [ ] Run focused tests and commit `feat: add wallet payment experience`.

### Task 6: Verification, documentation, and controlled release

**Files:**
- Create: `docs/payments/alrajhi-activation.md`
- Create: `docs/payments/api.md`
- Test: `tests/unit/payment-security.test.ts`

- [ ] Add tests for forged callback, duplicate callback, direct balance-credit attempt, secret redaction, and disabled-method behaviour; run them red then green.
- [ ] Write sandbox and production activation instructions, including required official bank contract details, callback URL registration, test cases, operational switches, reconciliation, and rollback.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `prisma validate`, and `pnpm audit --prod`; inspect migration/schema diff.
- [ ] Create a full Trbhh backup and rollback SHA, deploy only after Sandbox evidence passes, then confirm payment-disabled and transfer-enabled/disabled behaviours on production.
