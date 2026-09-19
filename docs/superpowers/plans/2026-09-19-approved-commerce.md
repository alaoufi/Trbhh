# Approved Commerce and Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build approved-goods ordering separately from external-contact advertisements, restore configurable categories, and make verified payment settlement and notifications replay-safe.

**Architecture:** Additive commerce tables and server-only services reuse current member identity but never wallet top-up settlement. Independent category tables extend real ads. All external payment creation is disabled until a reviewed provider contract and test-mode verification are available; supplier settlement is strictly offline.

**Tech Stack:** Existing Next.js 16, TypeScript, Prisma/MySQL, Vitest and Playwright. No new framework.

## Execution checkpoint — 2026-09-19

- [x] Core money/order/attempt/settlement/outbox implemented; real MySQL replay, race and rollback tests passed.
- [x] Real-ad category integration, editable definitions and 30 explicit templates implemented; local browser confirms job/land field changes.
- [x] Approved-goods admin, private member orders, checkout validation and gateway contract boundary implemented.
- [x] Notification claim/dispatch separated from payment; delivery ambiguity cannot recreate a charge.
- [x] Public/member/store/admin/developer guidance updated; production untouched.
- [ ] Provider-specific bank adapter, authenticated callbacks/webhooks and authorized sandbox acceptance. Runtime intentionally unregistered.
- [ ] Live SMS/WhatsApp delivery acceptance, operational fulfillment/refund handling, catalog imagery/navigation acceptance.
- [ ] Bulk legacy reassignment (deferred; current table read-only), fresh production backup/restore and release.

Detailed acceptance and remaining boundaries: `docs/COMMERCE_ACCEPTANCE_20260919.md`. Original task checklists below remain as the complete target, not a claim that all work shipped.

---

## Task 1 — durable commerce core

Files: `src/lib/commerce/{money,types,orders,schema}.ts`, `prisma/schema.prisma`, `tests/unit/commerce-*.test.ts`, `tests/integration/commerce-orders-mysql.test.ts`.

- [ ] Write failing tests for exact money, request replay/content conflict, approved/visible product checks, one payment attempt, payment amount/currency/reference mismatch, replayed settlement, and notification outbox uniqueness.

```ts
expect(parseSar('10.25')).toBe(1025);
expect(() => parseSar('10.251')).toThrow();
expect(paymentMatches({amountMinor:1025,currency:'SAR',reference:'a'},
  {amountMinor:1024,currency:'SAR',reference:'a'})).toBe(false);
```

- [ ] Run `node node_modules/vitest/vitest.mjs run tests/unit/commerce-*.test.ts`; require missing-behavior failure before implementation.
- [ ] Add `commerce_products`, `commerce_orders`, `commerce_order_items`, `commerce_payment_attempts`, `commerce_notifications`, `commerce_audit_events`; one attempt per order and provider/reference uniqueness. Integer minor units, no legacy wallet writes.
- [ ] Implement create-order transaction with product lock/stock reservation, user+request uniqueness and request fingerprint. Claim payment with conditional update before external I/O. An unresolved attempt cannot return to a createable state.
- [ ] Settlement locks order/attempt and validates evidence, marks paid once, writes audit and per-recipient/channel notification rows in the same transaction. No network I/O in transaction.
- [ ] Integration test actual MySQL concurrency and rollback, with loopback disposable-database guards and exact fixture cleanup. Unsupported/uncertain gateway results remain action_required, never fake paid.
- [ ] Review spec then code quality; commit Arabic message after fresh remote comparison. No push to deployment branch.

## Task 2 — category-specific real-ad fields

Files: `src/lib/ad-categories/`, `src/components/ad-category-fields.tsx`, `src/app/admin/categories/`, real ad new/edit/actions/detail integration, `tests/unit/ad-category-*.test.ts`.

- [ ] Test disabled/hidden categories, subcategory-parent membership, unknown field rejection, number/select/multiselect validation, hidden-required policy, job fields without condition or sale price, and omission of unused optional fields.

```ts
expect(visibleValues([{key:'rooms',visible:true}], {})).toEqual([]);
expect(() => validateValues([{key:'type',type:'select',options:['أرض']}],
  {type:'invalid'})).toThrow();
```

- [ ] Use private additive category field/value tables and existing category IDs; do not overwrite current ad titles/images/owners. Admin can activate/hide and define type/options/required/order/group.
- [ ] Same-page grouped form; subcategory selection changes permitted fields. Validate on server on create/edit. Optional empty fields absent in ad output. Job branch does not render the existing generic used/new or sale-price controls.
- [ ] Add admin listing for unclassified/Other and bulk reassignment with explicit selected IDs and audit; never automatically rewrite all old ads.
- [ ] Keep global rollout switch off until integration/visual checks. Preserve original layout and RegionCityPicker.
- [ ] Review and test before integrating schema statements into startup sync.

## Task 3 — member/admin commerce UI and payment adapter boundary

Files: `src/app/{shop,account/orders,admin/commerce}/`, `src/lib/commerce/{config,gateway}.ts`, `src/app/api/commerce/`, tests under `tests/unit/commerce-*`.

- [ ] Test unauthorized approval/settings, hidden products, price tampering, attempt-create timeout, duplicate callback, wrong user order, and absent configuration.
- [ ] Admin approval and inventory/prices are explicit; public routes expose no supplier cost or notes. Existing ads remain contact-only unless separately approved as a commerce product.
- [ ] Customer submits only product/quantity and server-issued request key. Show order total and shipping terms before payment. No mandatory wallet top-up.
- [ ] Gateway creation uses claimed attempt, separate callback routes and unique commerce reference, not wallet settlement callbacks. Reuse only reviewed lower-level provider capabilities. Financial enablement requires exact amount/currency verification and no ambiguous-create retries.
- [ ] Where the provider contract is not verified, show blocked readiness rather than a pretend payment button. Obtain no new billing authority implicitly.

## Task 4 — durable notifications

Files: `src/lib/commerce/notifications.ts`, `src/app/admin/commerce/actions.ts`, tests under `tests/unit/commerce-notifications.test.ts`.

- [ ] Test both available channels, SMS-only, WhatsApp-only, neither configured, per-channel failure and concurrency; notification retries must never call a payment function.
- [ ] Use existing SMS/WhatsApp adapters with configured admin recipient. Claim each persisted delivery atomically, acknowledge success, track failure/unknown safely and expose manual reconciliation. Never embed card data.
- [ ] Internal order status remains available even if channels fail. Notification message includes order number, exact paid amount and payment reference only.

## Task 5 — acceptance and release gates

- [ ] `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, full Vitest and `node node_modules/next/dist/bin/next build` against disposable DB.
- [ ] MySQL concurrency/replay integration; browser member/admin flow; no payment or SMS network outside explicitly enabled test adapters.
- [ ] Update `/guide`, `/guide/store`, `/admin/guide` and Arabic operating docs. Record implemented versus blocked capabilities.
- [ ] Fresh backup/restore proof before any live schema or deploy, preserving active DB, image mounts, signing secrets, all member records. No deployment until acceptance evidence is complete.

## Phase boundaries

Salla/CJ connection credentials are not available to this plan. No claims of connected suppliers, catalog import, successful Mada merchant acceptance, or real notification delivery without evidence. Future supplier integration consumes the approved-commerce interfaces and never pays suppliers automatically.
