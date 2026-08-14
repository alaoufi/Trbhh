# Neoleap Wallet Topup Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give members one clear wallet top-up experience while crediting an online Neoleap payment exactly once after server-side confirmation and preserving bank-transfer top-ups.

**Architecture:** Keep `wallet_topups` as the pending-payment record and `wallet_txns` as the member ledger. Add a Neoleap adapter behind the existing `PayProvider` boundary, a provider-neutral result page, and an atomic credit operation. Neoleap remains disabled until its official Sandbox contract supplies exact endpoints and signature rules.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, existing Trbhh wallet and payment modules.

---

### Task 1: Make online-crediting atomic and precision-safe

**Files:**
- Modify: `src/lib/wallet.ts: createOnlineTopup through creditOnlineTopup`
- Modify: `prisma/schema.prisma: wallet_topups`
- Modify: `src/data/schema-sync.ts: wallet_topups additions`
- Test: `tests/unit/online-topup-credit.test.ts`

- [ ] **Step 1: Write failing tests for one-time crediting**

```ts
it('credits a confirmed top-up exactly once when called twice', async () => {
  const first = await creditConfirmedOnlineTopup(deps, 17, 'mada');
  const second = await creditConfirmedOnlineTopup(deps, 17, 'mada');
  expect(first).toMatchObject({ ok: true, already: false });
  expect(second).toMatchObject({ ok: true, already: true });
  expect(deps.balanceChanges).toEqual([{ userId: 9, amountHalala: 10_050 }]);
  expect(deps.ledgerRows).toHaveLength(1);
});

it('does not credit when the request is no longer pending', async () => {
  await expect(creditConfirmedOnlineTopup(rejectedDeps, 17, 'mada')).resolves.toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm.cmd vitest run tests/unit/online-topup-credit.test.ts`

Expected: failure because `creditConfirmedOnlineTopup` does not exist.

- [ ] **Step 3: Add immutable payment identifiers and the transaction helper**

Add `transaction_id`, `idempotency_key`, `amount_halala`, `currency`, `gateway_response`, and `verified_at` to `wallet_topups` with idempotent schema sync. Generate cryptographic identifiers in `createOnlineTopup`. Implement `creditConfirmedOnlineTopup` inside one Prisma transaction: lock/read pending row, mark success once, add halalas to the active wallet balance, and add one ledger row sharing `money_ref=transaction_id`. Return `already:true` without changing balance for a completed row.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm.cmd vitest run tests/unit/online-topup-credit.test.ts`

Expected: 2 passing tests with one balance change and one ledger row.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma src/data/schema-sync.ts src/lib/wallet.ts tests/unit/online-topup-credit.test.ts
git commit -m "feat: make online wallet credit idempotent"
```

### Task 2: Add the Neoleap provider boundary and safe configuration

**Files:**
- Create: `src/lib/payments/providers/neoleap.ts`
- Modify: `src/lib/payments/types.ts`
- Modify: `src/lib/payments/index.ts`
- Modify: `src/lib/payments/registry.ts`
- Modify: `src/lib/payments/config.ts`
- Modify: `.env.example`
- Test: `tests/unit/neoleap-config.test.ts`
- Test: `tests/unit/neoleap-provider.test.ts`

- [ ] **Step 1: Write failing configuration and adapter tests**

```ts
it('requires every Neoleap sandbox setting without exposing its value', () => {
  const report = neoleapConfigReport({ NEOLEAP_ENVIRONMENT: 'sandbox' });
  expect(report.ready).toBe(false);
  expect(report.fields.find((f) => f.key === 'NEOLEAP_TRANSPORTAL_PASSWORD')).toMatchObject({ present: false });
  expect(report.fields.find((f) => f.key === 'NEOLEAP_TRANSPORTAL_PASSWORD')).not.toHaveProperty('value');
});

it('rejects an unsigned webhook before it can supply a payment reference', async () => {
  await expect(neoleap.verifyWebhook({ rawBody: '{}', headers: new Headers() }, creds)).resolves.toEqual({ valid: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm.cmd vitest run tests/unit/neoleap-config.test.ts tests/unit/neoleap-provider.test.ts`

Expected: failure because Neoleap report and adapter do not exist.

- [ ] **Step 3: Implement the disabled-safe adapter**

Define Neoleap environment variables for Merchant/Terminal/Alias/Transportal/Resource Key, hosted URL, transaction verification URL, refund URL, callback signature algorithm/header, and `DATABASE_PAYMENT_SECRET`. Register `neoleap` in `ADAPTERS`, but leave `ready:false` until official request fields and signature algorithm are supplied. The adapter must fail closed if an endpoint, signature rule, currency, or expected merchant reference is absent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm.cmd vitest run tests/unit/neoleap-config.test.ts tests/unit/neoleap-provider.test.ts`

Expected: tests pass; no credential value is emitted.

- [ ] **Step 5: Commit**

```powershell
git add .env.example src/lib/payments tests/unit/neoleap-config.test.ts tests/unit/neoleap-provider.test.ts
git commit -m "feat: add neoleap payment configuration boundary"
```

### Task 3: Secure callback and webhook confirmation

**Files:**
- Modify: `src/app/api/pay/callback/[provider]/route.ts`
- Modify: `src/app/api/pay/webhook/[provider]/route.ts`
- Modify: `src/lib/payments/index.ts`
- Test: `tests/unit/payment-confirmation.test.ts`

- [ ] **Step 1: Write failing confirmation tests**

```ts
it('credits only after provider verification returns the original halala amount', async () => {
  const result = await confirmTopupById(17, verifiedDeps);
  expect(result).toEqual({ paid: true, credited: true });
});

it('does not credit when a provider reports a different amount', async () => {
  const result = await confirmTopupById(17, mismatchDeps);
  expect(result).toMatchObject({ paid: true, credited: false, reason: 'amount_mismatch' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm.cmd vitest run tests/unit/payment-confirmation.test.ts`

Expected: failure because confirmation uses whole-riyal comparison and lacks verified gateway evidence.

- [ ] **Step 3: Implement verification-first confirmation**

Read raw webhook body, verify the Neoleap signature before extracting a reference, then call Neoleap’s server-side status endpoint. Match provider reference, transaction ID, SAR halala amount, currency, and successful state before invoking the atomic helper. Store only a redacted gateway-response summary. Browser callback receives only the internal top-up ID and performs the same verification; it cannot credit a wallet itself.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm.cmd vitest run tests/unit/payment-confirmation.test.ts`

Expected: success, mismatch, duplicate callback, and unsigned webhook cases pass.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/pay src/lib/payments tests/unit/payment-confirmation.test.ts
git commit -m "feat: verify online topups before crediting wallets"
```

### Task 4: Build the unified member top-up and result pages

**Files:**
- Create: `src/app/payment/result/page.tsx`
- Create: `src/components/wallet-online-topup.tsx`
- Modify: `src/app/account/wallet/page.tsx`
- Modify: `src/app/account/actions.ts`
- Test: `tests/unit/wallet-topup-page.test.ts`

- [ ] **Step 1: Write failing presentation tests**

```ts
it('renders fixed amounts and a custom amount for enabled electronic payment', () => {
  expect(walletTopupView({ electronic: true, transfer: true }).quickAmounts).toEqual([10, 50, 100, 500, 1000]);
});

it('keeps bank transfer visible when electronic payment is disabled', () => {
  expect(walletTopupView({ electronic: false, transfer: true }).showBankTransfer).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm.cmd vitest run tests/unit/wallet-topup-page.test.ts`

Expected: failure because `walletTopupView` and the standalone component do not exist.

- [ ] **Step 3: Implement the member flow**

Extract an RTL top-up component that shows balance, supported payment badges, five amount buttons, custom amount, test-mode label, and the hosted-checkout submit button. Keep the existing bank account, receipt, and request form in a separate labelled section. Send online results to `/payment/result?t=<internal-id>` and render safe success/pending/failed states from the database, including updated balance only for success.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm.cmd vitest run tests/unit/wallet-topup-page.test.ts`

Expected: both payment-method visibility cases pass.

- [ ] **Step 5: Commit**

```powershell
git add src/app/account/wallet/page.tsx src/app/account/actions.ts src/app/payment/result/page.tsx src/components/wallet-online-topup.tsx tests/unit/wallet-topup-page.test.ts
git commit -m "feat: add unified wallet topup checkout"
```

### Task 5: Update administration and operational documentation

**Files:**
- Modify: `src/app/admin/payments/page.tsx`
- Modify: `src/app/admin/actions.ts`
- Create: `docs/payments/neoleap-activation.md`
- Modify: `src/app/admin/guide/page.tsx`
- Test: `tests/unit/neoleap-admin-settings.test.ts`

- [ ] **Step 1: Write the failing admin policy test**

```ts
it('refuses electronic activation until Neoleap fields and a current sandbox test pass', () => {
  expect(canActivateNeoleap({ configured: true, lastTest: 'failed', mode: 'test' })).toBe(false);
  expect(canActivateNeoleap({ configured: true, lastTest: 'success', mode: 'test' })).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm.cmd vitest run tests/unit/neoleap-admin-settings.test.ts`

Expected: failure because activation state has no recorded test result.

- [ ] **Step 3: Implement the activation gate and guide**

Add presence-only Neoleap fields, a disabled-by-default Sandbox/Production selector, and a test status panel. Do not add a live “test connection” button until the official endpoint contract defines a harmless authenticated request. Document exact callback/webhook registration on `trbhh.sa`, secret placement, sandbox test matrix, reconciliation, production switch, and rollback.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm.cmd vitest run tests/unit/neoleap-admin-settings.test.ts`

Expected: only complete, successfully tested configuration can be activated.

- [ ] **Step 5: Commit**

```powershell
git add src/app/admin/payments/page.tsx src/app/admin/actions.ts src/app/admin/guide/page.tsx docs/payments/neoleap-activation.md tests/unit/neoleap-admin-settings.test.ts
git commit -m "feat: gate neoleap activation on sandbox verification"
```

### Task 6: Full verification and controlled release

**Files:**
- Verify: all files above
- Verify: `.github/workflows/fetch-full-backup.yml`
- Verify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Run the payment and wallet tests**

Run: `pnpm.cmd vitest run tests/unit/online-topup-credit.test.ts tests/unit/neoleap-config.test.ts tests/unit/neoleap-provider.test.ts tests/unit/payment-confirmation.test.ts tests/unit/wallet-topup-page.test.ts tests/unit/neoleap-admin-settings.test.ts`

Expected: all pass.

- [ ] **Step 2: Run static validation**

Run: `pnpm.cmd exec tsc --noEmit; pnpm.cmd exec eslint src/lib/payments src/lib/wallet.ts src/app/api/pay src/app/account src/app/payment src/app/admin/payments tests/unit; git diff --check`

Expected: zero TypeScript, lint, and whitespace errors.

- [ ] **Step 3: Test Sandbox only after official package arrives**

Run: execute the documented successful, rejected, cancelled, duplicate callback, duplicate webhook, amount mismatch, and connection-timeout cases using Neoleap test data.

Expected: only successful verified payment changes wallet balance; all other cases leave it unchanged.

- [ ] **Step 4: Back up and deploy Trbhh only**

Run: `gh workflow run fetch-full-backup.yml --repo alaoufi/Trbhh`, wait for success, record current production SHA, then push only the approved Trbhh branch and wait for `deploy.yml` success.

Expected: a Trbhh-scoped backup artifact exists before deploy; `agar.trbhh.sa` is not deployed or modified.

- [ ] **Step 5: Read-only production checks**

Run: `curl.exe -sS -I https://trbhh.sa/` and open the member result page only with a non-paying/expired test reference.

Expected: Trbhh returns 200 with security headers; no payment option activates until the Sandbox gate is satisfied.
