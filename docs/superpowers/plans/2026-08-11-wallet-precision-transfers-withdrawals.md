# Wallet Precision, Transfers, and Withdrawals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Trbhh's member wallet to exact halala accounting, then add isolated linked-account transfers, controlled bank withdrawals, service-cancellation settings, and correct top-up promotion visibility.

**Architecture:** Add parallel halala columns before switching reads and writes, so legacy whole-riyal data remains a verified rollback reference. A money module converts and formats values without floating point; all mutations use one database transaction and a unique reference. Transfers and withdrawals are separate domain records, while `wallet_txns` remains the immutable member-facing ledger.

**Tech Stack:** Next.js server actions, TypeScript, Prisma/MySQL, Vitest, GitHub Actions backup/deploy workflow.

---

## File structure

- Modify: `prisma/schema.prisma` — parallel halala columns and transfer/withdrawal models.
- Modify: `src/data/schema-sync.ts` — idempotent columns/tables/indexes only; no silent data conversion.
- Create: `src/lib/money.ts` — exact decimal parser, formatter, halala conversion, member-favourable proration.
- Create: `src/lib/wallet-money-migration.ts` — explicit, one-time, checked migration and reconciliation report.
- Modify: `src/lib/wallet.ts` — halala-native balance, hold, ledger, and summary APIs.
- Modify: `src/lib/member-services.ts`, `src/lib/member-service-proration.ts` — halala amounts and settings snapshot.
- Create: `src/lib/wallet-transfers.ts` — internal linked-account transfer transaction.
- Create: `src/lib/wallet-withdrawals.ts` — bank-account and withdrawal lifecycle.
- Modify: `src/lib/settings.ts`, `src/app/admin/actions.ts`, `src/app/admin/revenue/page.tsx` — cancellation/refund and withdrawal-fee settings, admin review actions.
- Modify: `src/app/account/actions.ts`, `src/app/account/wallet/page.tsx` — member actions and operations-first UI.
- Modify: `src/components/topup-promo-banner.tsx` — hide bonus campaign when rewards are disabled.
- Create/modify: focused `tests/unit/*.test.ts` files listed below.

### Task 1: Exact-money foundation

**Files:**
- Create: `tests/unit/money.test.ts`
- Create: `src/lib/money.ts`

- [ ] **Step 1: Write failing money tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseSarToHalalas, formatHalalas, refundableHalalas } from '@/lib/money';

describe('money', () => {
  it('parses Arabic wallet input exactly without floats', () => {
    expect(parseSarToHalalas('10.25')).toBe(1025);
    expect(parseSarToHalalas('10')).toBe(1000);
    expect(parseSarToHalalas('10.257')).toBeNull();
  });
  it('rounds a fractional unused service period up to the member\'s halala', () => {
    expect(refundableHalalas(101, new Date(0), new Date(100), new Date(50))).toBe(51);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm vitest run tests/unit/money.test.ts`  
Expected: FAIL because `src/lib/money.ts` does not exist.

- [ ] **Step 3: Implement the minimal exact APIs**

```ts
export function parseSarToHalalas(raw: string): number | null {
  const match = raw.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(whole) ? whole * 100 + fraction : null;
}
export function refundableHalalas(amount: number, startsAt: Date, endsAt: Date, cancelledAt: Date) {
  const total = endsAt.getTime() - startsAt.getTime();
  const remaining = Math.min(total, Math.max(0, endsAt.getTime() - cancelledAt.getTime()));
  return total > 0 ? Math.min(amount, Math.ceil(amount * remaining / total)) : 0;
}
```

Add `formatHalalas` using integer quotient/remainder, never `Number#toFixed`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/money.test.ts`  
Expected: PASS.

Commit: `git add src/lib/money.ts tests/unit/money.test.ts && git commit -m "إضافة حسابات المحفظة بالهللة"`

### Task 2: Parallel schema and checked migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/data/schema-sync.ts`
- Create: `src/lib/wallet-money-migration.ts`
- Create: `tests/unit/wallet-money-migration.test.ts`

- [ ] **Step 1: Write schema/migration contract tests**

```ts
expect(schema).toContain('balance_halala');
expect(schema).toContain('amount_halala');
expect(schema).toContain('model wallet_withdrawal_requests');
expect(migrationSource).toContain('balance_halala = balance * 100');
expect(migrationSource).toContain('wallet_money_v1');
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run tests/unit/wallet-money-migration.test.ts`  
Expected: FAIL because the columns and migration module do not exist.

- [ ] **Step 3: Add schema without changing legacy values**

Add nullable `balance_halala` and `reserved_halala` to `users`; nullable `amount_halala`, `balance_after_halala`, and `money_ref` to `wallet_txns`; nullable `amount_halala` to `wallet_topups` and `member_service_orders`; and immutable per-order service settings snapshots. Add `wallet_bank_accounts` and `wallet_withdrawal_requests` with user, amount, fee, net, state, reference, timestamps, and indexes.

In `schema-sync.ts`, add only idempotent `ALTER TABLE ... ADD COLUMN` / `CREATE TABLE IF NOT EXISTS` statements. Do not multiply production values during normal page rendering.

Implement `migrateWalletMoneyV1()` to acquire one MySQL advisory lock, create/read a `wallet_money_migrations` marker, populate all parallel columns with `legacy * 100` in one transaction, reconcile each member and total ledger sums, then write the marker only after reconciliation passes. It must return an error report instead of swallowing an error.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/wallet-money-migration.test.ts`  
Expected: PASS.

Commit: `git add prisma/schema.prisma src/data/schema-sync.ts src/lib/wallet-money-migration.ts tests/unit/wallet-money-migration.test.ts && git commit -m "إضافة ترحيل محفظة آمن للهللات"`

### Task 3: Convert the wallet engine and all charged paths

**Files:**
- Modify: `src/lib/wallet.ts`
- Modify: `src/lib/member-services.ts`
- Modify: `src/lib/member-service-proration.ts`
- Modify: all files returned by `rg -l "\\b(charge|adjustBalance|holdBalance|captureHold|releaseHold|getBalance|getReserved|getAvailableBalance|creditUser|debitUser)\\(" src`
- Test: `tests/unit/wallet-halala-engine.test.ts`

- [ ] **Step 1: Write failing atomic ledger tests**

```ts
it('uses halala balance and ledger fields for a 10.25 SAR debit', async () => {
  const result = await debitHalalas(7, 1025, 'member_service');
  expect(result.balanceHalalas).toBe(8975);
  expect(txn.amount_halala).toBe(-1025);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest run tests/unit/wallet-halala-engine.test.ts`  
Expected: FAIL because halala-native APIs do not exist.

- [ ] **Step 3: Implement one compatibility boundary**

Create halala-native `getBalanceHalalas`, `holdHalalas`, `captureHoldHalalas`, `releaseHoldHalalas`, and `adjustHalalas` in `wallet.ts`. Each reads/writes only the parallel halala columns after the migration marker is present and writes a matching `wallet_txns` row with `money_ref`. Preserve compatibility display wrappers only at UI boundaries. Convert every listed charge/hold caller from a whole-riyal value to `parseSarToHalalas` or `riyalsToHalalas`; no caller may use `Math.round(Number(formData.get('amount')))`. Change service proration to call `refundableHalalas`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/wallet-halala-engine.test.ts tests/unit/member-service-proration.test.ts tests/unit/member-services.test.ts`  
Expected: PASS.

Commit: `git add src tests/unit && git commit -m "تحويل محرك المحفظة إلى الهللات"`

### Task 4: Service cancellation policy

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/member-services.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/revenue/page.tsx`
- Modify: `src/app/account/wallet/page.tsx`
- Test: `tests/unit/member-service-cancellation-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
expect(canCancel({ allowCancel: true, allowRefund: false })).toBe(true);
expect(refundFor({ allowCancel: true, allowRefund: false, amountHalalas: 2000 })).toBe(0);
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run tests/unit/member-service-cancellation-policy.test.ts`  
Expected: FAIL because settings snapshots are absent.

- [ ] **Step 3: Implement snapshots and disclosure**

Add two admin settings defaulting to cancellation allowed and refund disabled. At service creation snapshot both choices. In member acceptance text disclose the exact cancellation/refund policy before debit. Permit cancellation only if the snapshot allows it; credit a refund only if its snapshot allows it.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/member-service-cancellation-policy.test.ts tests/unit/member-services.test.ts`  
Expected: PASS.

Commit: `git add src tests/unit && git commit -m "إضافة سياسة إلغاء واسترداد الخدمات"`

### Task 5: Linked-account internal transfers

**Files:**
- Create: `src/lib/wallet-transfers.ts`
- Modify: `src/lib/wallet.ts`
- Modify: `src/app/account/actions.ts`
- Modify: `src/app/account/wallet/page.tsx`
- Test: `tests/unit/wallet-transfers.test.ts`

- [ ] **Step 1: Write failing transfer tests**

```ts
it('moves one halala only inside the linked group', async () => {
  await expect(transferBetweenLinkedAccounts(1, 2, 1)).resolves.toMatchObject({ ok: true });
  expect(source.balance_halala).toBe(999);
  expect(target.balance_halala).toBe(1);
});
it('rejects a target outside the owner linked group', async () => {
  await expect(transferBetweenLinkedAccounts(1, 99, 100)).resolves.toMatchObject({ ok: false, code: 'not_linked' });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run tests/unit/wallet-transfers.test.ts`  
Expected: FAIL because transfer module does not exist.

- [ ] **Step 3: Implement atomic transfer**

Validate the target with `linkedUserIds(sourceUserId)`, reject self/foreign/insufficient requests, then debit and credit inside one Prisma transaction. Use one generated reference stored on both ledger rows and a dedicated transfer record. The page obtains balance and ledger only from `session.uid`, labels the active account, and presents only linked target accounts.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/wallet-transfers.test.ts tests/unit/member-wallet-page.test.ts`  
Expected: PASS.

Commit: `git add src tests/unit && git commit -m "إضافة تحويل الرصيد بين حسابات العضو"`

### Task 6: Bank withdrawal requests

**Files:**
- Create: `src/lib/wallet-withdrawals.ts`
- Modify: `src/lib/wallet.ts`
- Modify: `src/app/account/actions.ts`
- Modify: `src/app/account/wallet/page.tsx`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/revenue/page.tsx`
- Test: `tests/unit/wallet-withdrawals.test.ts`

- [ ] **Step 1: Write failing withdrawal lifecycle tests**

```ts
it('holds 100.00 and calculates a 93.00 payout after a 7.00 transfer fee', async () => {
  const r = await createWithdrawal(1, 10000, bankAccountId, 700);
  expect(r).toMatchObject({ heldHalalas: 10000, feeHalalas: 700, netHalalas: 9300 });
});
it('releases the exact hold when a pending request is rejected or cancelled', async () => {
  await rejectWithdrawal(adminId, requestId, 'بيانات غير مكتملة');
  expect(member.reserved_halala).toBe(0);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run tests/unit/wallet-withdrawals.test.ts`  
Expected: FAIL because withdrawal module does not exist.

- [ ] **Step 3: Implement lifecycle**

Implement member bank-account creation/verification with masked IBAN presentation, and withdrawal statuses `pending`, `approved`, `rejected`, `cancelled`, `paid`. `createWithdrawal` snapshots the configured transfer fee, validates positive net, and calls `holdHalalas`. Member cancellation and admin rejection call `releaseHoldHalalas` exactly once. Only `markWithdrawalPaid` calls `captureHoldHalalas` after an authorized admin records the bank reference or proof. Do not create an external banking integration.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/wallet-withdrawals.test.ts`  
Expected: PASS.

Commit: `git add src tests/unit && git commit -m "إضافة طلبات السحب البنكي للمحفظة"`

### Task 7: Operations-first UI and disabled promotions

**Files:**
- Modify: `src/app/account/wallet/page.tsx`
- Modify: `src/components/topup-promo-banner.tsx`
- Modify: `src/app/admin/revenue/page.tsx`
- Modify: `src/app/admin/actions.ts`
- Test: `tests/unit/member-wallet-page.test.ts`
- Test: `tests/unit/topup-promo-banner.test.ts`

- [ ] **Step 1: Write failing UI contracts**

```ts
expect(walletPage).toContain('الحساب النشط');
expect(walletPage.indexOf('سجل العمليات')).toBeLessThan(walletPage.indexOf('حسابات التحويل'));
expect(promoBanner).toContain('if (!campaign || !rewardsEnabled) return null');
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run tests/unit/member-wallet-page.test.ts tests/unit/topup-promo-banner.test.ts`  
Expected: FAIL because the contracts are not present.

- [ ] **Step 3: Implement the UI boundaries**

Move the transaction tabs and lists above top-up/account details. Place balance/account summary after operational content, with exact formatted amounts, and reveal secondary account details only when its section is opened. In the administration wallets tab, render a searchable name-only list initially; fetch/render balance, active operations, and detailed ledger only for the explicitly selected member, with a clear return-to-list action. Add transfer and withdrawal sections with clear pending/held/paid state. Add the transfer-fee and service-cancellation settings in the existing money/pricing administration view. Define `rewardsEnabled` as an active campaign with at least one positive bonus and the reward feature enabled; use it in both home and wallet promotion rendering.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/unit/member-wallet-page.test.ts tests/unit/topup-promo-banner.test.ts tests/unit/admin-member-wallet-page.test.ts`  
Expected: PASS.

Commit: `git add src tests/unit && git commit -m "تطوير عمليات المحفظة وتعطيل عروض الشحن"`

### Task 8: Full verification, migration rehearsal, and controlled deployment

**Files:**
- Modify only if required by results: `docs/superpowers/specs/2026-08-11-wallet-precision-transfers-withdrawals-design.md`

- [ ] **Step 1: Run complete local verification**

Run: `pnpm vitest run`  
Expected: all tests PASS.

Run: `pnpm exec tsc --noEmit`  
Expected: exit code 0.

Run: `pnpm build`  
Expected: exit code 0; document existing non-blocking warnings separately.

Run: `git diff --check`  
Expected: no output.

- [ ] **Step 2: Create production safety point**

Run the existing `fetch-full-backup.yml` workflow for Trbhh only and wait for success. Record its run ID and the deployment commit as the rollback point. Do not run any Agar workflow or touch `staging`.

- [ ] **Step 3: Run migration once and validate reconciliation**

Deploy the compatible schema code, run the explicit locked migration command once through the existing Trbhh deployment path, and require its report to show: all populated parallel values equal legacy value × 100, each member balance reconciles, and no unresolved ledger rows. Abort and roll back if any check fails.

- [ ] **Step 4: Deploy and perform read-only health checks**

Push only the Trbhh deployment branch, wait for its deployment workflow success, then check guest redirects/headers for `trbhh.sa`, `trbhh.com`, and a read-only health response for both. Confirm Agar remains untouched.

- [ ] **Step 5: Commit documentation**

Commit: `git add docs/superpowers && git commit -m "توثيق ترحيل محفظة الهللات"`
