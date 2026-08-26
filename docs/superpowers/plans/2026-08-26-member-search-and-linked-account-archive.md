# Member Search and Linked Account Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make administrator member search Arabic-tolerant and provide safe inspection, unlinking, archiving, and deletion for accounts connected through unified login.

**Architecture:** A focused server-only member-search module owns Arabic normalization and bounded matching. A separate member-disposition service inventories dependencies and archives accounts with records; the established deletion anonymizer is used only for empty accounts.

**Tech Stack:** Next.js 15, TypeScript, Prisma/MySQL, Vitest, existing account links and audit services.

---

### Task 1: Arabic-tolerant member search

**Files:**
- Create: `src/lib/member-admin-search.ts`
- Create: `tests/unit/member-admin-search.test.ts`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/search/page.tsx`

- [ ] Write a failing test that asserts `normalizeMemberSearch('أبو  مـاجِد ١')` equals `ابو ماجد 1` and that `memberSearchTerms('ابو ماجد')` returns two terms.
- [ ] Run `.\\node_modules\\.bin\\vitest.cmd run tests\\unit\\member-admin-search.test.ts` and confirm the module-missing failure.
- [ ] Implement normalization for hamza/alef, ta marbuta, alef maqsura, diacritics, tatweel, Arabic numerals, punctuation and repeated spaces. Query a bounded candidate set, then require every normalized term against name, username, email, phone and member ID.
- [ ] Replace raw one-string `LIKE` logic in both `/admin/users` and `/admin/search`, preserving telephone lookup, pagination and permissions.
- [ ] Run the focused test and commit `fix: make admin member search Arabic tolerant`.

### Task 2: Professional member result cards

**Files:**
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/search/page.tsx`
- Modify: `src/lib/account-links.ts`
- Test: `tests/unit/member-admin-search.test.ts`

- [ ] Write a failing page-source test requiring the labels `الحسابات الموحدة`, `فتح ملف العضو`, and `فتح المحفظة`.
- [ ] Run the focused test and confirm failure.
- [ ] Add a batched link-group summary helper without credentials or tokens.
- [ ] Render responsive cards with display name, username, member ID, masked phone, state, linked-account count and direct profile/wallet/message/permissions actions. Keep destructive actions only inside the profile.
- [ ] Run the focused test and commit `feat: clarify member search results and linked accounts`.

### Task 3: Account dependency inspection, archive, and empty-account deletion

**Files:**
- Modify: `src/data/schema-sync.ts`
- Modify: `prisma/schema.prisma`
- Create: `src/lib/member-disposition.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/users/[id]/page.tsx`
- Test: `tests/unit/member-disposition.test.ts`

- [ ] Write a failing policy test: any advertisement, store, balance, payment, or message means `archive`; no dependencies means `delete`.
- [ ] Run `.\\node_modules\\.bin\\vitest.cmd run tests\\unit\\member-disposition.test.ts` and confirm failure.
- [ ] Add nullable `archived_at`, `archived_by`, and `archive_reason` user fields plus an `archived_at` index through schema sync and Prisma.
- [ ] Implement an inventory that counts advertisements, stores, wallet balances/transactions/top-ups, and chats. Archive unlinks unified login, sets archive fields, invalidates login tokens, and preserves rights records. Empty-account deletion uses existing `deleteAccountNow` only after a second confirmation.
- [ ] Add guarded actions: `users:edit` for unlinking and `users:delete` for archive/delete. Recompute inventory in the action before changing data and write an audit event.
- [ ] Add one disposition panel in the administrator member profile: inspect counts, archive when records exist, or permanently delete only when empty.
- [ ] Run the focused test and commit `feat: archive linked accounts with dependency checks`.

### Task 4: Direct guide links

**Files:**
- Modify: `src/app/guide/page.tsx`
- Modify: `src/app/admin/guide/page.tsx`
- Modify: `src/app/guide/store/page.tsx`
- Create: `tests/unit/member-guides.test.ts`

- [ ] Write failing tests for direct `/account/identities` links in user/store guides and `/admin/users` in the admin guide.
- [ ] Add concise instructions: members unlink owned accounts, administrators search then inspect/archive, and store accounts with stores or financial history archive rather than delete.
- [ ] Run the guide tests and commit `docs: link member account administration guides`.

### Task 5: Verification and release

- [ ] Run `vitest` for the new search, disposition, and guide tests plus existing wallet tests.
- [ ] Run `tsc --noEmit` and `git diff --check`.
- [ ] Create a rollback tag from the deployed SHA and wait for full backup workflow success.
- [ ] Push to `claude/hostinger-vps-project-amw8vb`, wait for deployment success, verify `https://trbhh.sa/login` returns HTTP 200, then manually verify that `ابو ماجد` finds both accounts in an administrator session.
