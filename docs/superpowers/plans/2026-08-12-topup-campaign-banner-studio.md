# Topup Campaign Banner Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Trbhh administrators create, preview, schedule, and publish top-up reward banners with safe visual variations, while preserving every existing campaign.

**Architecture:** Extend the existing JSON-backed `TopupCampaign` with a validated presentation object. A shared, data-only banner view renders the public banner and the admin preview identically. A small client-side studio owns draft form state and displays a simulated home-page placement for mobile and desktop; the server action accepts only the validated option identifiers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Define a backward-compatible presentation contract

**Files:**
- Modify: `src/lib/settings.ts`
- Create: `tests/unit/topup-campaign-presentation.test.ts`

- [ ] **Step 1: Write the failing tests**

Test that a legacy campaign gets the `heritage` / `standard` defaults, that allowed template, layout, and size keys survive parsing, and that untrusted values become the defaults.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: FAIL because the presentation parser and defaults do not exist.

- [ ] **Step 3: Implement the minimal presentation parser**

Add exported immutable option lists and a `normalizeTopupCampaignPresentation` helper. Extend `TopupCampaign` with `presentation`, while parsing existing stored records without rejecting them.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: PASS.

### Task 2: Render one reusable safe banner view

**Files:**
- Create: `src/components/topup-campaign-banner-view.tsx`
- Modify: `src/components/topup-promo-banner.tsx`
- Test: `tests/unit/topup-campaign-presentation.test.ts`

- [ ] **Step 1: Add a failing render-contract test**

Test that every template option has a non-empty public label and that each presentation normalizes to an allowed visual key.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: FAIL because the template catalogue is absent.

- [ ] **Step 3: Implement the shared banner view**

Render a link-safe, responsive banner with predefined gradient classes only. Support the catalogue: heritage, navy-gold, ocean, sunset, royal, mint, midnight, and pearl; layouts ribbon, cards, spotlight, and split; sizes compact, standard, and large. Refactor the public server component to pass the active campaign presentation to this view.

- [ ] **Step 4: Run the focused test**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: PASS.

### Task 3: Add the in-place banner studio to the admin campaign form

**Files:**
- Create: `src/components/admin/topup-banner-studio.tsx`
- Modify: `src/app/admin/revenue/page.tsx`
- Test: `tests/unit/topup-campaign-presentation.test.ts`

- [ ] **Step 1: Add the failing UI-source contract test**

Test the exported catalogue includes at least eight templates, four layouts, and three sizes, so the future library cannot regress to a single fixed design.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: FAIL before the complete catalogue is exported.

- [ ] **Step 3: Implement the client studio**

Use form-associated hidden inputs for selected safe keys. Include template cards, layout choices, responsive size choices, a mobile/desktop switch, and a simulated home-page frame showing the real slot between the masthead and the feed. Keep all campaign amount inputs in the existing server form.

- [ ] **Step 4: Run the focused test**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: PASS.

### Task 4: Persist presentation safely when publishing a campaign

**Files:**
- Modify: `src/app/admin/actions.ts`
- Test: `tests/unit/topup-campaign-presentation.test.ts`

- [ ] **Step 1: Add a failing action-input test**

Test normalization of form-like presentation values and verify invalid values cannot be stored.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: FAIL before action normalization uses the presentation helper.

- [ ] **Step 3: Implement server-side normalization**

Read only `bannerTemplate`, `bannerLayout`, and `bannerSize`; normalize all values server-side before appending the new campaign. Preserve schedule overlap protection and all existing tier validation.

- [ ] **Step 4: Run the focused test**

Run: `pnpm test tests/unit/topup-campaign-presentation.test.ts`
Expected: PASS.

### Task 5: Verify and release safely

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-topup-campaign-banner-studio.md`

- [ ] **Step 1: Run all unit tests, type check, lint, and production build**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all required checks exit 0; document existing warnings separately if any.

- [ ] **Step 2: Inspect the diff and commit only the Trbhh feature**

Run: `git diff --check && git status --short`
Expected: only the planned Trbhh files are changed.

- [ ] **Step 3: Create the production backup and rollback point before deployment**

Run the repository backup workflow, record its successful run and the exact deploy commit, then deploy only the Trbhh production branch.

- [ ] **Step 4: Verify live behavior read-only**

Check the public `.sa` homepage, the admin campaign page while authenticated, and the `.com` redirect. Confirm Agar is neither deployed nor changed.
