# Member Wallet Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an auditable member wallet and special-service lifecycle that charges only after member acceptance and returns the unused portion on cancellation.

**Architecture:** `wallet_txns` remains the immutable balance ledger and `wallet_topups` remains the top-up detail source. A new `member_service_orders` entity records services created by the manager; guarded database transactions write exactly one debit on acceptance and exactly one refund when eligible.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, Tailwind CSS, Lucide.

---

## File structure

- `prisma/schema.prisma` and `src/data/schema-sync.ts` — service-order model and idempotent production schema.
- `src/lib/member-service-proration.ts` — pure, whole-riyal-safe refund calculation matching the existing wallet.
- `src/lib/member-services.ts` — authenticated lifecycle, search DTOs, atomic balance operations.
- `src/app/account/wallet/page.tsx`, `src/app/account/actions.ts`, `src/components/mobile-nav.tsx` — member experience.
- `src/app/admin/revenue/page.tsx`, `src/app/admin/actions.ts`, `src/components/admin-nav-def.ts` — management workspace.
- `tests/unit/member-service-proration.test.ts`, `tests/unit/member-services.test.ts`, `tests/unit/member-wallet-page.test.ts`, `tests/unit/admin-member-wallet-page.test.ts` — regression tests.

### Task 1: Model the special-service order

**Files:**
- Modify: `prisma/schema.prisma: after wallet_topups`
- Modify: `src/data/schema-sync.ts: wallet schema statements`
- Create: `tests/unit/member-services.test.ts`

- [ ] **Step 1: Write the failing schema contract test**

```ts
expect(schema).toContain('model member_service_orders');
expect(schema).toContain('@@index([user_id, status]');
expect(sync).toContain('CREATE TABLE IF NOT EXISTS member_service_orders');
```

- [ ] **Step 2: Run it and confirm failure**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/member-services.test.ts`

Expected: FAIL because the model/table is absent.

- [ ] **Step 3: Add model and idempotent table**

Add fields `id`, `user_id`, `admin_id`, `title`, `description`, `amount`, `starts_at`, `ends_at`, `accept_until`, `status`, `accepted_at`, `execution_confirmed_at`, `cancelled_at`, `cancelled_by`, `cancel_reason`, `debit_txn_id`, `refund_txn_id`, `created_at`, and `updated_at`. Amount is an integer in Saudi riyals, matching the current `users.balance` and `wallet_txns.amount` convention. Create indexes `(user_id,status)` and `(status,accept_until)`.

```sql
CREATE TABLE IF NOT EXISTS member_service_orders (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 admin_id BIGINT UNSIGNED NOT NULL, title VARCHAR(160) NOT NULL,
 description TEXT NULL, amount INT NOT NULL, starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL, accept_until DATETIME NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'pending_acceptance',
 accepted_at DATETIME NULL, execution_confirmed_at DATETIME NULL,
 cancelled_at DATETIME NULL, cancelled_by VARCHAR(12) NULL,
 cancel_reason VARCHAR(300) NULL, debit_txn_id BIGINT NULL,
 refund_txn_id BIGINT NULL, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NULL, INDEX member_service_orders_user_status (user_id,status),
 INDEX member_service_orders_expiry (status,accept_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

- [ ] **Step 4: Generate Prisma and run test**

Run: `pnpm prisma generate; & .\node_modules\.bin\vitest.CMD run tests/unit/member-services.test.ts`

Expected: generation and test pass.

- [ ] **Step 5: Commit**

Run: `git add prisma/schema.prisma src/data/schema-sync.ts tests/unit/member-services.test.ts; git commit -m "إضافة نموذج أوامر خدمات المحفظة"`

### Task 2: Implement the safe financial lifecycle

**Files:**
- Create: `src/lib/member-service-proration.ts`
- Create: `src/lib/member-services.ts`
- Modify: `src/lib/wallet.ts: TxnReason and REASON_LABELS`
- Create: `tests/unit/member-service-proration.test.ts`
- Modify: `tests/unit/member-services.test.ts`

- [ ] **Step 1: Write failing money tests**

```ts
expect(refundableRiyals(20, new Date('2026-08-01'), new Date('2026-08-11'), new Date('2026-08-06'))).toBe(10);
expect(refundableRiyals(20, new Date('2026-08-01'), new Date('2026-08-11'), new Date('2026-08-20'))).toBe(0);
await expect(acceptMemberServiceOrder(21, 8)).resolves.toMatchObject({ ok: true });
await expect(acceptMemberServiceOrder(21, 8)).resolves.toMatchObject({ ok: false, code: 'not_pending' });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/member-service-proration.test.ts tests/unit/member-services.test.ts`

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement the pure proration helper**

```ts
export function refundableRiyals(amount: number, startsAt: Date, endsAt: Date, cancelledAt: Date) {
  const total = endsAt.getTime() - startsAt.getTime();
  if (!Number.isInteger(amount) || amount <= 0 || total <= 0) return 0;
  const remaining = Math.min(total, Math.max(0, endsAt.getTime() - cancelledAt.getTime()));
  return Math.floor((amount * remaining) / total);
}
```

- [ ] **Step 4: Implement guarded lifecycle methods**

Create server-only `createMemberServiceOrder`, `acceptMemberServiceOrder`, `confirmMemberServiceExecution`, `cancelMemberServiceOrder`, `expirePendingMemberServiceOrders`, `listMyMemberServiceOrders`, `listAdminMemberWallets`, and `getAdminMemberWallet`. Extend wallet reasons with `member_service`; notes must include `خدمة خاصة #${orderId}`.

Use `prisma.$transaction`. Acceptance must update a user only where `balance >= amount`, transition only `pending_acceptance`, create one negative ledger row, and save its id. Expiry/manual pre-acceptance cancellation never changes balance. Confirmation transitions to `active`; member cancellation transitions only `active` orders with `refund_txn_id: null`, credits the calculated refund once, and saves the positive `refund` ledger id.

- [ ] **Step 5: Run lifecycle tests**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/member-service-proration.test.ts tests/unit/member-services.test.ts`

Expected: PASS for insufficient balance, double acceptance, expiry without debit, and one-time refund.

- [ ] **Step 6: Commit**

Run: `git add src/lib/member-service-proration.ts src/lib/member-services.ts src/lib/wallet.ts tests/unit/member-service-proration.test.ts tests/unit/member-services.test.ts; git commit -m "إضافة دورة خدمات المحفظة الآمنة"`

### Task 3: Build the member wallet

**Files:**
- Modify: `src/app/account/wallet/page.tsx`
- Modify: `src/app/account/actions.ts`
- Modify: `src/components/mobile-nav.tsx`
- Create: `tests/unit/member-wallet-page.test.ts`

- [ ] **Step 1: Write failing UI contract checks**

```ts
expect(page).toContain('سجل شحن الرصيد');
expect(page).toContain('العمليات النشطة');
expect(page).toContain('سجل العمليات');
expect(page).toContain('confirmMemberServiceExecutionAction');
```

- [ ] **Step 2: Run test and confirm failure**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/member-wallet-page.test.ts`

Expected: FAIL because the tabs and actions are absent.

- [ ] **Step 3: Add member-only server actions**

Add accept, confirm-execution, and cancel actions. Every action uses `requireUser`, accepts only a positive numeric order ID, calls the lifecycle library with `session.uid`, revalidates `/account/wallet`, and redirects with a whitelisted result code.

- [ ] **Step 4: Render balance, tabs, and scoped search**

Make available balance `text-emerald-700 font-extrabold text-4xl`. Add `topups`, `active`, and `history` query-string tabs. Filter only the current member's data by service title, ledger note, transaction number, provider reference, ad reference, type/status/date. Show top-up method as bank transfer or card/gateway, and service start/end/deadline/status. Disable acceptance and show the shortfall when balance is insufficient.

- [ ] **Step 5: Put wallet directly after home for signed-in mobile members**

```ts
{ href: '/', label: 'الرئيسية', icon: Home },
{ href: '/account/wallet', label: 'محفظتي', icon: Wallet },
```

Import `Wallet`; guests must not receive this item.

- [ ] **Step 6: Verify and commit**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/member-wallet-page.test.ts tests/unit/member-service-proration.test.ts tests/unit/member-services.test.ts; pnpm exec tsc --noEmit`

Expected: PASS and TypeScript code `0`.

Run: `git add src/app/account/wallet/page.tsx src/app/account/actions.ts src/components/mobile-nav.tsx tests/unit/member-wallet-page.test.ts; git commit -m "تطوير واجهة محفظة العضو"`

### Task 4: Build the administrator member-wallet workspace

**Files:**
- Modify: `src/app/admin/revenue/page.tsx`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/components/admin-nav-def.ts`
- Create: `tests/unit/admin-member-wallet-page.test.ts`

- [ ] **Step 1: Write failing admin contract checks**

```ts
expect(nav).toContain("href: '/admin/revenue?tab=wallets'");
expect(nav).toContain('محافظ الأعضاء');
expect(page).toContain("tab === 'wallets'");
expect(page).toContain('بحث ذكي في المحافظ');
```

- [ ] **Step 2: Run test and confirm failure**

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/admin-member-wallet-page.test.ts`

Expected: FAIL because the workspace is absent.

- [ ] **Step 3: Add permission-checked actions**

Add create/cancel service actions using `requireAdmin`. Validate member ID, title, positive whole-riyal amount, chronological dates and approval deadline server-side. The administrator ID always comes from session; create never debits balance.

- [ ] **Step 4: Render financial members, search, detail, and order form**

Add `wallets` under revenue. List only members with a ledger movement or service order and aggregate available balance, total top-ups, total debits, pending amount, active-service count. Smart search supports name, phone, email, member/transaction ID, provider reference, service title, ad reference; add movement/method/status/date/amount filters. Detail shows full member-only timeline. Service form shows available balance, request amount, and sufficient/insufficient before creation.

- [ ] **Step 5: Add navigation and verify**

```ts
{ href: '/admin/revenue?tab=wallets', label: 'محافظ الأعضاء', icon: WalletCards, perm: 'users' },
```

Run: `& .\node_modules\.bin\vitest.CMD run tests/unit/admin-member-wallet-page.test.ts tests/unit/member-services.test.ts; pnpm exec tsc --noEmit`

Expected: PASS and TypeScript code `0`.

- [ ] **Step 6: Commit**

Run: `git add src/app/admin/revenue/page.tsx src/app/admin/actions.ts src/components/admin-nav-def.ts tests/unit/admin-member-wallet-page.test.ts; git commit -m "إضافة محافظ الأعضاء للإدارة"`

### Task 5: Verify, backup, and deploy Trbhh only

**Files:**
- Verify: all changed Trbhh files, `.github/workflows/fetch-full-backup.yml`, and deployment workflow.

- [ ] **Step 1: Run full verification**

Run: `& .\node_modules\.bin\vitest.CMD run; pnpm exec tsc --noEmit; pnpm exec next build; git diff --check; git status --short`

Expected: tests/typecheck/build exit `0`, no whitespace errors, and no Agar files or staging branch changes.

- [ ] **Step 2: Check financial invariants**

Confirm: short balance leaves order/balance untouched; repeat acceptance produces one debit; expiry/pre-acceptance cancellation produces no debit; 20 SAR for 10 days cancelled after 5 returns 10 SAR; cross-member reads/actions fail; payment-provider credentials and activation are absent.

- [ ] **Step 3: Create a verified backup before production**

Run: `gh workflow run 'fetch-full-backup.yml' --repo alaoufi/Trbhh; gh run list --repo alaoufi/Trbhh --workflow 'fetch-full-backup.yml' --limit 1`

Expected: the list returns exactly one newest run ID. Use that displayed ID with `gh run view RUN_ID --repo alaoufi/Trbhh` and proceed only after its conclusion reads `success`.

Expected: `completed` and `success` before pushing deployment.

- [ ] **Step 4: Deploy only the Trbhh production branch**

Run: `git push origin HEAD:claude/hostinger-vps-project-amw8vb; gh run list --repo alaoufi/Trbhh --workflow deploy.yml --limit 1`

Expected: the list returns the deployment run ID. Use that displayed ID with `gh run view RUN_ID --repo alaoufi/Trbhh` and proceed only after its conclusion reads `success`.

Expected: deployment workflow succeeds; do not push `staging` or invoke Agar.

- [ ] **Step 5: Run read-only health checks and hand off rollback information**

Run: `curl.exe -I https://trbhh.com/account/wallet; curl.exe -I https://trbhh.sa/account/wallet; curl.exe -I https://agar.trbhh.com/`

Expected: Trbhh is healthy through Cloudflare and Agar remains reachable/unchanged. Report backup run, deployment run, deployed and previous commits, validation results, and keep payment gateway disabled until its official signature verification is completed.
