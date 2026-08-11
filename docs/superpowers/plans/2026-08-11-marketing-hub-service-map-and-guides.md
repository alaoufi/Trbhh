# Marketing Hub, Service Map, and Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate member advertising/marketing, add administration-wide ad follow-up, and publish accurate service maps and guides.

**Architecture:** Preserve existing ad and promotion tables/routes while adding navigational hubs over them. Derive all statuses from current data; never duplicate or migrate member advertisements solely for presentation.

**Tech Stack:** Next.js, TypeScript, Prisma/MySQL, Vitest.

---

### Task 1: Member marketing hub

**Files:**
- Create: `src/app/account/marketing/page.tsx`
- Modify: `src/app/account/layout.tsx`, `src/app/promote/page.tsx`, `src/app/account/promos/page.tsx`
- Test: `tests/unit/member-marketing-hub.test.ts`

- [ ] Write a failing contract asserting the four hub labels and compatibility links; run it and confirm failure.
- [ ] Build the hub from existing member ads, promo requests, and wallet links; redirect old promotional entry pages to their hub tabs without changing their actions.
- [ ] Run the focused test and commit `إضافة مركز إعلاناتي وتسويقها`.

### Task 2: Administration follow-up hub

**Files:**
- Create: `src/app/admin/marketing/page.tsx`
- Modify: `src/components/admin-nav-def.ts`
- Test: `tests/unit/admin-marketing-followup.test.ts`

- [ ] Write failing tests for active, pending, scheduled, stopped/archived, and paid promotional tabs.
- [ ] Query existing ads and promo rows with current permission gates; render owner, type, state, placement, and dates with direct links.
- [ ] Run focused tests and commit `إضافة متابعة الإعلانات والتسويق`.

### Task 3: Service maps and guide updates

**Files:**
- Create: `src/app/admin/service-map/page.tsx`
- Modify: `src/app/admin/guide/page.tsx`, `src/app/guide/page.tsx`, `src/app/guide/store/page.tsx`, `src/components/admin-nav-def.ts`
- Test: `tests/unit/service-map-and-guides.test.ts`

- [ ] Write failing contracts for payment, marketing, store, member, safety, and system service paths.
- [ ] Implement permission-filtered map cards and update the three guides with direct links and clear distinctions between promoted ads, paid marketing, and store display.
- [ ] Run focused tests and commit `تحديث خريطة الخدمات والأدلة`.

### Task 4: Verify and integrate

- [ ] Run focused Vitest tests, `node_modules/.bin/tsc.cmd --noEmit`, and `git diff --check`.
- [ ] Include these changes only in the Trbhh release after the wallet suite passes, backup succeeds, and the rollback point is recorded.
