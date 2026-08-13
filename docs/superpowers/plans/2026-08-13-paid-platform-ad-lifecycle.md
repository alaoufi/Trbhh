# Paid Platform Ad Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Deliver a centrally configurable, wallet-backed lifecycle for ads shown in Trbhh public listings. New general-member ads receive only the configured daily free allowance and free duration; later ads and all store ads promoted to Trbhh require a paid visibility package. Expired paid visibility hides the ad from visitors, remains clear to its owner, and can be renewed, archived and optionally have its ad-specific replies locked.

**Architecture:** `ads.trbhh_until` is the sole public-Trbhh entitlement, whether earned through a free allowance or paid from the wallet. `ads.store_only=1` continues to mean the item is visible only inside its own store unless it receives a valid `trbhh_until`; nothing changes to store-front listing rules. A new lifecycle library owns settings interpretation, status computation, server-side package selection and public predicates. Lifecycle metadata records notifications and archive state without reusing moderation, owner-pause or manual-archive fields. An ad-contact conversation table is introduced because existing direct messages have no ad identifier.

**Tech Stack:** Next.js 16 Server Components/actions and Route Handlers, TypeScript, Prisma/MySQL, Vitest, existing wallet ledger, chat service, cache utilities and Hostinger production workflow.

## File structure

- `src/lib/platform-ad-lifecycle.ts` — typed settings, entitlement decisions, package resolution, message-template rendering and lifecycle status.
- `src/lib/platform-ad-visibility.ts` — single Prisma predicate used only by Trbhh public ad queries.
- `src/lib/platform-ad-contact.ts` — ad-specific conversation association and reply-lock lookup.
- `src/data/schema-sync.ts` / `prisma/schema.prisma` — lifecycle and conversation schema changes.
- `src/app/ads/actions.ts` / `src/components/ad-form.tsx` — member free/paid decision while publishing a new public ad.
- `src/app/account/actions.ts` / `src/app/account/ads/page.tsx` — owner renewal, status and archive experience.
- `src/app/account/company/actions.ts` / `src/app/ads/[id]/page.tsx` — one renewal path for promoted store ads and ad-context messaging.
- `src/app/api/chat/[peerId]/route.ts` / `src/app/messages/actions.ts` — enforce lock only when a send is explicitly attached to an archived ad.
- `src/app/admin/actions.ts` / `src/app/admin/revenue/page.tsx` — central lifecycle settings and operator audit view.
- `src/lib/subscription.ts` — throttled expiry/archival sweep alongside existing reminder jobs.
- `tests/unit/platform-ad-lifecycle.test.ts`, `tests/unit/platform-ad-lifecycle-integration.test.ts`, `tests/unit/platform-ad-contact.test.ts` — policy, isolation and reply-lock regressions.

## Task 1: Define policy, amounts and settings

**Files:** Create `tests/unit/platform-ad-lifecycle.test.ts`, `src/lib/platform-ad-lifecycle.ts`; modify `src/lib/settings.ts`.

- [ ] Write failing unit tests for `platformAdState`, `renewalDecision`, package audiences and halala-safe formatting. Cover an active entitlement; expired entitlement; archive deadline; store-front item with no entitlement; a package price larger than available balance; and a 0.01 SAR shortfall. Use integer wallet values exactly as the existing wallet ledger does—never JavaScript floating-point arithmetic.
- [ ] Run `& .\node_modules\.bin\vitest.cmd run tests/unit/platform-ad-lifecycle.test.ts` and confirm failure because the lifecycle module does not exist.
- [ ] In `src/lib/settings.ts`, add a reader whose defaults keep current public general ads visible until an administrator explicitly enables enforcement. Include `platform_ad_lifecycle_enabled`, `platform_ad_member_free_daily_limit`, `platform_ad_member_free_days`, `platform_ad_archive_after_days`, `platform_ad_lock_ad_replies`, `platform_ad_sms_enabled`, and expiry/shortfall/archive templates. Add a per-existing-package active flag and audience (`member`, `store`, `both`) while retaining server-owned price/days keys.
- [ ] Implement only pure decisions and server-side package lookup in `src/lib/platform-ad-lifecycle.ts`. State values are `not-enforced`, `active`, `renewal-required`, `payment-archived`, and `store-front-only`; package prices/durations, entitlement dates and balances never come from client input.
- [ ] Re-run the focused test; then commit `feat: define public ad lifecycle policy` with only these files.

## Task 2: Add safe database fields and one public-listing predicate

**Files:** Modify `src/data/schema-sync.ts`, `prisma/schema.prisma`, `src/lib/data.ts`, `src/lib/saved-search.ts`; create `src/lib/platform-ad-visibility.ts`, `tests/unit/platform-ad-lifecycle-integration.test.ts`.

- [ ] Write failing source-level and pure-predicate tests. Assert every current Trbhh listing path using `store_only` / `trbhh_until` (`activeAdWhere`, approved-user list, text search and saved search) imports the shared predicate, while store-front queries do not. Assert disabled enforcement retains the legacy general-ad condition and enabled enforcement requires future `trbhh_until`.
- [ ] Run `& .\node_modules\.bin\vitest.cmd run tests/unit/platform-ad-lifecycle-integration.test.ts` and confirm failure.
- [ ] Provision idempotently and mirror in Prisma: `platform_hidden_at`, `platform_archived_at`, `platform_last_expiry_notice_at`, `platform_last_archive_notice_at`, `platform_package`, `platform_amount`, and an index on `trbhh_until`. Do not change `status`, `state`, `data_archive`, `arc_msg`, or `paused_by_owner`.
- [ ] Implement `platformAdPublicWhere(now, lifecycleEnabled)`: enabled requires `status: 1`, `state: 'active'`, `trbhh_until > now`; disabled preserves current `store_only=0 OR trbhh_until>now`. Replace duplicate predicates, preserving the approved-user exception only where it already exists. Pass focused tests and commit `feat: centralize public ad visibility entitlement`.

## Task 3: Make new public-ad visibility explicit and wallet-safe

**Files:** Modify `src/app/ads/actions.ts`, `src/components/ad-form.tsx`, `src/app/ads/new/page.tsx`, `src/lib/platform-ad-lifecycle.ts`; tests in `tests/unit/platform-ad-lifecycle.test.ts` and `tests/unit/platform-ad-lifecycle-integration.test.ts`.

- [ ] Add failing tests for: a general ad within daily allowance receives `trbhh_until = publish time + free days`; an ad above allowance is saved for its owner but remains out of public listing until paid; and a store-only item receives no free public entitlement and remains visible only in its store.
- [ ] Keep `checkFlood`, `adsPerDay`, gap-hours, moderation, duplicate and store-subscription guards unchanged in `createAdAction`. Add a separate count for new general ads granted free public entitlement today; do not treat package `adsPerDay` as a paid bypass.
- [ ] When enabled: within allowance, create entitlement only for configured free days; above allowance, save normally and return a clear payment-needed result; store-only ads never consume allowance; scheduled/moderation-pending ads use actual publish/approval time. Display package, balance and exact shortfall before payment confirmation. Accept only `adId`/`pkg`; server resolves all money/days. Do not charge rejected, pending or unpublished ads.
- [ ] Pass tests, inspect preserved anti-abuse guards, and commit `feat: apply free and paid public ad placement policy`.

## Task 4: Create one secure renewal path and lifecycle sweep

**Files:** Modify `src/lib/platform-ad-lifecycle.ts`, `src/app/account/actions.ts`, `src/app/account/company/actions.ts`, `src/lib/subscription.ts`; test `tests/unit/platform-ad-lifecycle.test.ts`.

- [ ] Add failing tests for ownership, audience, master switch, insufficient funds, active extension from existing future date, expired extension from now, duplicate concurrent submission and promoted store ad. Assert expired general ads never become free again.
- [ ] Implement transactional `renewPlatformAd`: debit once with ledger reason `ad_show`, then update `trbhh_until`, `platform_package`, `platform_amount`, and lifecycle markers atomically. General ads accept member/both packages; store-only ads accept store/both packages. Refactor `buyAdShowAction` to call it, revalidate correct routes and bust Trbhh caches only.
- [ ] Implement throttled `runPlatformAdLifecycleSweep()` in `src/lib/subscription.ts`: mark expiry once, send in-app template via `sendChat`, optionally use the existing configured SMS sender only when enabled with a validated phone, and set `platform_archived_at` after configured deadline. Use `ad_contacts` counts; never modify moderation fields. Pass tests and commit `feat: renew and expire public ad placements`.

## Task 5: Give owners clear status, recovery and archive information

**Files:** Modify `src/lib/account.ts`, `src/app/account/ads/page.tsx`, `src/app/ads/[id]/page.tsx`, `src/app/account/actions.ts`; test `tests/unit/platform-ad-lifecycle-integration.test.ts`.

- [ ] Write readable UTF-8 page assertions for “مخفي بانتظار التجديد”, expiry time, package, balance, shortfall, “تجديد رفع الإعلان”, “شحن الرصيد”, archived reason and WhatsApp/call contact total. Assert a store-front-only item has no Trbhh renewal card.
- [ ] Expose lifecycle data from `getMyAds`; owner views retain their ad even when visitors cannot. Reuse package form on general expired-ad detail and store promotion form on store items. Preserve current manual archive/restore and moderation behaviour.
- [ ] Pass tests and commit `feat: clarify public ad payment status to owners`.

## Task 6: Add ad-specific conversations before reply locking

**Files:** Modify `src/data/schema-sync.ts`, `prisma/schema.prisma`, `src/app/ads/[id]/page.tsx`, `src/app/messages/[userId]/page.tsx`, `src/components/chat-room.tsx`, `src/app/api/chat/[peerId]/route.ts`, `src/app/messages/actions.ts`; create `src/lib/platform-ad-contact.ts`, `tests/unit/platform-ad-contact.test.ts`.

- [ ] Write failing tests: a conversation started from ad `#42` records `ad_id=42`, buyer, seller; an archived ad with locking blocks only seller outgoing messages in that thread; existing messages remain readable; the same seller’s normal `/messages/[userId]` conversation and store-front conversations remain unaffected.
- [ ] Provision `ad_contact_threads` with unique `(ad_id, buyer_id, seller_id)`, timestamps and participant-pair index. Do not infer historic thread associations from text or participant pairs.
- [ ] “مراسلة” in the ad page opens normal messages with validated `ad` context. The message page validates owner/peer, creates/loads association only for a non-owner viewer and passes `adId` to `ChatRoom`. `ChatRoom`, API route and server action independently validate the association and deny only owner reply when `platform_archived_at` plus `platform_ad_lock_ad_replies` apply. Return a clear Arabic payment message rather than generic error.
- [ ] Pass tests and commit `feat: lock replies only for archived ad conversations`.

## Task 7: Centralize controls, legacy activation and operator audit

**Files:** Modify `src/app/admin/revenue/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/guide/page.tsx`; test `tests/unit/platform-ad-lifecycle-integration.test.ts`.

- [ ] Add failing tests requiring section `نشر الإعلانات في تربح` under `المال والمشتريات ← كل التسعيرات`, controls for master switch/free limit/free duration/archive/reply lock/SMS/templates/package active/audience/price/days, and audit search. Reject negative values, invalid audience and invalid active package duration.
- [ ] Add one pricing-policy section below current promoted-store/ad controls. Keep existing price/duration keys as source of truth and attach package active/audience beside them. Add search/filter of active, renewal-required and payment-archived ads with owner, package, expiry, amount, contact count and notice timestamps.
- [ ] Add explicit legacy activation: before enabling enforcement show count of active legacy general ads and require a nonzero bridge duration. Server stamps qualifying legacy ads `trbhh_until = now + bridge days`, logs it, then enables enforcement. No existing live ad disappears merely when new code deploys.
- [ ] Update guide with exact path, free limit vs `adsPerDay`, templates, SMS prerequisite, bridge and store-front isolation. Pass tests and commit `feat: manage public ad lifecycle from revenue settings`.

## Task 8: Validate, back up, release and verify only Trbhh

- [ ] Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/unit/platform-ad-lifecycle.test.ts tests/unit/platform-ad-lifecycle-integration.test.ts tests/unit/platform-ad-contact.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
& .\node_modules\.bin\eslint.cmd .
git diff --check
```

- [ ] Manually verify within-limit member, above-limit member, shortfall, paid renewal, store-front item, paid promoted store item, expiry, archive contact count, enabled/disabled ad-reply lock, normal messages, legacy bridge and disabled master switch.
- [ ] Run the successful full Trbhh backup workflow and record its URL/SHA as rollback point before push. Confirm its manifest is Trbhh scoped. Never use Agar code, data, secrets, backups or deploy targets.
- [ ] Push only the Trbhh branch, wait for Hostinger VPS deployment success, then use read-only checks on `https://trbhh.sa/`, public listings, owner ad page and a store-front-only page. Confirm no legacy ads disappear before explicit bridge activation.
