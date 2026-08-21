# Member Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface purchasable package services to members and let them self-subscribe securely from wallet balance.

**Architecture:** Keep pricing as the source of truth in existing `packages` and settings tables. Add an atomic member-package purchase domain operation, a server action for the catalog, then reuse the existing sidebar and pricing page patterns for the member UI and collapsible admin grouping.

**Tech Stack:** Next.js 16 server components/actions, TypeScript, Prisma/MySQL, Vitest, Tailwind CSS.

---

### Task 1: Package purchase domain operation

**Files:**
- Modify: `src/lib/packages.ts`
- Test: `tests/unit/packages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('charges and assigns an active paid package for the requested duration', async () => {
  const result = await buyMemberPackage(7, 2, 30);
  expect(result).toEqual({ ok: true, balance: 70 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/packages.test.ts`
Expected: FAIL because `buyMemberPackage` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export async function buyMemberPackage(userId: number, packageId: number, days: number) {
  // Read active paid package by id; reject zero/invalid duration.
  // In one database transaction: verify balance, decrement it, insert wallet ledger,
  // and upsert user_packages with the calculated expiry.
}
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm test tests/unit/packages.test.ts`
Expected: PASS.

- [ ] **Step 5: Add insufficient-balance coverage and commit**

```ts
it('does not assign or charge when balance is insufficient', async () => {
  await expect(buyMemberPackage(7, 2, 30)).resolves.toMatchObject({ ok: false });
});
```

Run: `pnpm test tests/unit/packages.test.ts`
Then commit: `git commit -am "feat: enable member package purchases"`

### Task 2: Member catalog, checkout action, and contextual routing

**Files:**
- Modify: `src/app/packages/page.tsx`
- Modify: `src/app/account/actions.ts`
- Modify: `src/app/ads/actions.ts`
- Test: `tests/unit/member-package-actions.test.ts`

- [ ] **Step 1: Write failing action tests**

```ts
it('redirects to wallet top-up when the member cannot afford a package', async () => {
  await expect(runPurchase({ packageId: '2', days: '30' })).rejects.toMatch('/account/wallet?need=package');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test tests/unit/member-package-actions.test.ts`
Expected: FAIL because the action is absent.

- [ ] **Step 3: Implement the server action and catalog states**

```ts
export async function buyMemberPackageAction(formData: FormData) {
  const result = await buyMemberPackage(session.uid, Number(formData.get('packageId')), Number(formData.get('days')));
  if (!result.ok) redirect('/account/wallet?need=package');
  redirect('/packages?success=1');
}
```

Render only active, non-free packages. Add buttons and explicit low-balance messages. Change daily-limit redirects to `/packages?reason=limit` and same-owner duplicate redirects to the existing duplicate-package selector.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test tests/unit/member-package-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git commit -am "feat: show and sell member packages"`

### Task 3: Sidebar discovery and admin package grouping

**Files:**
- Modify: `src/components/site-menu.tsx`
- Modify: `src/app/admin/revenue/page.tsx`
- Test: `tests/unit/package-navigation.test.tsx`

- [ ] **Step 1: Write failing visibility tests**

```tsx
it('shows available packages as the first member sidebar entry', () => {
  render(<SiteMenu isAuthed currentUid={7} />);
  expect(screen.getByRole('link', { name: 'الباقات المتاحة' })).toHaveAttribute('href', '/packages');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/package-navigation.test.tsx`
Expected: FAIL because the entry is absent.

- [ ] **Step 3: Implement minimal navigation and collapse grouping**

Add `/packages` above other member account entries only for authenticated users. Make `pricing` label `الباقات والخدمات` and wrap existing pricing regions in clearly named `Collapse` sections without changing their inputs or values.

- [ ] **Step 4: Run focused test**

Run: `pnpm test tests/unit/package-navigation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git commit -am "feat: organize packages and services"`

### Task 4: Full validation and controlled delivery

**Files:**
- Verify: `src/lib/packages.ts`, `src/app/packages/page.tsx`, `src/app/account/actions.ts`, `src/components/site-menu.tsx`, `src/app/admin/revenue/page.tsx`

- [ ] **Step 1: Run static checks**

Run: `pnpm typecheck && pnpm lint`
Expected: exit code 0.

- [ ] **Step 2: Run package test suite**

Run: `pnpm test`
Expected: exit code 0.

- [ ] **Step 3: Build production bundle**

Run: `pnpm build`
Expected: exit code 0.

- [ ] **Step 4: Review delivery diff and commit**

Run: `git diff HEAD~3..HEAD --check && git status --short`
Expected: no whitespace errors and a clean worktree.

- [ ] **Step 5: Create backup and deploy only after checks pass**

Use the existing production backup workflow, deploy to Trbhh only, then verify logged-out catalog visibility and authenticated sidebar visibility before announcing publication.
