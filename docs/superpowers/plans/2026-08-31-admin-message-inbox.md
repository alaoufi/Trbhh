# Administrative Message Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, actionable administration-message inbox with archive-first handling and confirmed permanent deletion from the archive.

**Architecture:** Preserve individual `chats` records and add one status record per member-to-primary-admin thread. New member messages reopen archived threads. Open threads feed the red alert; permanent deletion is allowed only after archiving.

**Tech Stack:** Next.js server actions, Prisma/MySQL, Vitest, existing permissions and `ConfirmSubmit`.

---

### Task 1: Establish the regression contract

**Files:**
- Create: `tests/unit/admin-message-inbox.test.ts`

- [ ] Write a failing Vitest source-contract test that requires the alert target to be `/admin/messages?tab=open` and the page to contain `أرشفة المحادثة`, `الرد على العضو`, `حذف المحادثة نهائياً`, and `tab === 'archived'`.
- [ ] Run `node_modules/.bin/vitest.cmd run tests/unit/admin-message-inbox.test.ts`; it must fail because the production behavior is absent.
- [ ] Commit only that failing test as `test: define admin message inbox workflow`.

### Task 2: Persist one archive status per administration thread

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/data/schema-sync.ts`

- [ ] Add `admin_message_threads` with `admin_id`, `member_id`, `status` defaulting to `open`, `archived_at`, `archived_by`, timestamps, a unique `(admin_id, member_id)` key, and an `(admin_id, status)` index.
- [ ] Add an idempotent matching `CREATE TABLE IF NOT EXISTS admin_message_threads` statement to `schema-sync.ts`.
- [ ] Run `node_modules/.bin/prisma.cmd generate` and `node_modules/.bin/tsc.cmd --noEmit`; both must exit zero.
- [ ] Commit the schema change as `feat: persist admin message thread archive state`.

### Task 3: Implement state lifecycle in the chat service

**Files:**
- Modify: `src/lib/chat.ts`
- Modify: `src/lib/admin-inbox.ts`

- [ ] When `sendChat` stores a member-to-primary-admin message, upsert its state to `open` and clear archive metadata. Never reopen on an admin-to-member reply.
- [ ] Add `listAdminInboxThreads(adminId, status)`, `archiveAdminThread(adminId, memberId, actorId)`, `restoreAdminThread(adminId, memberId)`, and `deleteArchivedAdminThread(adminId, memberId)`.
- [ ] Make permanent deletion verify archived state first, then delete both-direction message rows and the state record in one Prisma transaction.
- [ ] Update `countAdminUnread()` so it only counts open administration threads; old threads with no state record remain open.
- [ ] Type-check and commit as `feat: add archive-first admin message inbox operations`.

### Task 4: Build protected actions and the two-tab administration UI

**Files:**
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/messages/page.tsx`
- Modify: `src/components/admin-alerts-banner.tsx`

- [ ] Add archive/restore server actions guarded by `requireAction('messages', 'edit')` and archived permanent deletion guarded by `requireAction('messages', 'delete')`; validate ids, create an admin log, and revalidate `/admin/messages` plus `/`.
- [ ] Default the inbox to `?tab=open`; add a separate `?tab=archived` view. Open threads offer `الرد على العضو` linking to `/messages/{memberId}` and `أرشفة المحادثة`.
- [ ] In the archive, expose restore and `ConfirmSubmit` named `حذف المحادثة نهائياً`, with a confirmation that all messages will be removed permanently.
- [ ] Change the alert item to `{ n: adminUnread, label: 'مراسلة للإدارة تحتاج إجراء', href: '/admin/messages?tab=open', oldest: oldestAdminMsg }`.
- [ ] Run the new focused test, the full Vitest suite, and TypeScript; then commit as `feat: make admin messages actionable and archive-first`.

### Task 5: Backup-gated release verification

**Files:** No source change.

- [ ] Create a rollback tag and run the existing production backup workflow before pushing.
- [ ] Push only after backup success to `claude/hostinger-vps-project-amw8vb`.
- [ ] Verify live with a non-production test conversation: archive, confirm removal from alert/open tab, restore from archive, archive again, and open then cancel permanent-delete confirmation. Do not permanently delete a real member conversation during verification.
- [ ] Report backup id, release commit, test/type-check output, deployment status, and live verification evidence.

## Self-review

- Archive, archive-only confirmed deletion, reply path, alert target, reopening, permissions, backup, and live verification are covered.
- No placeholders are present; operations consistently use admin id, member id, and actor id.
