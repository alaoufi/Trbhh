# National Day Immersive Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact, vivid Saudi National Day entry sequence and national carousel on the public homepage, then restore the original experience automatically on 25 September.

**Architecture:** Keep campaign timing and slide data in `src/lib/national-day.ts`; isolate the first-entry client state in a focused component; add a compact layout option to the reusable hero. The homepage selects national slides only inside the existing server-side campaign window, leaving queries and feed cards untouched.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, Vitest, Sharp-generated WebP assets.

---

### Task 1: Add official local campaign assets

**Files:**
- Create: `public/national-day/saudi-flag.svg`
- Create: `public/national-day/leadership.webp`
- Create: `public/national-day/SOURCES.md`

- [x] Render the official Vision 2030 report portrait page at high resolution and create a respectful leadership composite that preserves the official portraits.
- [x] Generate 1600x900 WebP canvases with safe mobile focal positions.
- [x] Save the Saudi flag SVG locally and document both sources.
- [x] Verify every image with `sharp().metadata()` and keep each raster asset below 350KB.

### Task 2: Specify the campaign data and compact hero contract with failing tests

**Files:**
- Modify: `tests/unit/national-day.test.ts`
- Modify: `tests/unit/commerce-hero.test.ts`
- Modify: `tests/unit/home-category-page.test.ts`

- [x] Add tests expecting `nationalDayHeroSlides('/search')` to return exactly two local-image slides in the order leadership, flag.
- [x] Add a static-render test expecting `CommerceHero` with `compact` to include `data-hero-size="compact"` and compact height classes.
- [x] Update page composition tests to expect national slides inside the window and the existing marketplace slides outside it.
- [x] Run the focused tests and confirm they fail because the APIs do not exist yet.

### Task 3: Implement campaign data and compact hero

**Files:**
- Modify: `src/lib/national-day.ts`
- Modify: `src/components/commerce/commerce-hero.tsx`
- Modify: `src/app/page.tsx`

- [x] Export `nationalDayHeroSlides(href)` with the two local assets, Arabic titles, labels, and marketplace link.
- [x] Add `compact?: boolean` to `CommerceHero`; render 230/320px heights and smaller mobile typography only when true.
- [x] Select national slides during the campaign and pass `compact` on the public homepage.
- [x] Run the focused tests and confirm they pass.

### Task 4: Build the first-entry sequence test-first

**Files:**
- Create: `src/components/national-day-entry.tsx`
- Modify: `src/components/national-day-banner.module.css`
- Modify: `src/app/page.tsx`
- Modify: `tests/unit/national-day.test.ts`

- [x] Add a test expecting the active entry shell to contain the flag, leadership image, «تخطي», session-only marker, and reduced-motion semantics; verify it fails.
- [x] Implement the client component with `sessionStorage`, flag and leaders timers, cleanup, skip control, and `matchMedia` support.
- [x] Mount it only while the campaign is active and make the inline banner compact.
- [x] Run the focused tests and confirm they pass.

### Task 5: Visual and regression verification

**Files:**
- Modify: `tests/visual/public-home-fixture.tsx`
- Modify: `tests/visual/public-home-preview.cjs`

- [x] Add the national slides and entry component to the fixture.
- [x] Run `pnpm typecheck`, `pnpm lint`, focused tests, then the complete unit suite.
- [x] Inspect at 390x844 and desktop widths, confirm no horizontal overflow and that the search begins near the first mobile viewport.
- [x] Commit and push the feature branch only after all checks pass.

### Task 6: Safe production release

**Files:**
- Modify only the existing release safeguard profile if the current production checkpoint requires a new exact candidate.

- [ ] Create a rollback tag from the currently verified production commit.
- [ ] Run the before-release backup and isolated restore checks.
- [ ] Fast-forward the production branch without touching `main`.
- [ ] Wait for the correct Hostinger container to rebuild and restart.
- [ ] Run after-release database, runtime, and media comparisons.
- [ ] Verify the public homepage externally and in a 390px mobile browser before reporting completion.
