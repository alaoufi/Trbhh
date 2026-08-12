# Topup Banner Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add measurable banner dimensions and a full-page preview without publishing a campaign.

**Architecture:** Keep an allow-listed presentation model. The shared banner component maps stored width and height identifiers to actual CSS dimensions. The studio owns a draft presentation and opens a client-only simulated page using the shared banner renderer.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Vitest.

---

### Task 1: Presentation contract

**Files:**
- Modify: `src/lib/topup-campaign-presentation.ts`
- Modify: `tests/unit/topup-campaign-presentation.test.ts`

- [ ] Write failing tests asserting allowed widths `full`, `standard`, `card`, heights `short`, `medium`, `tall`, and rejection of unknown values.
- [ ] Run `node_modules/.bin/vitest.cmd run tests/unit/topup-campaign-presentation.test.ts`; expect failure.
- [ ] Add width/height normalization and template entries for `night-blue`, `offer-red`, `glow-purple`.
- [ ] Re-run focused test; expect pass.

### Task 2: Real dimensions and motion

**Files:**
- Modify: `src/components/topup-campaign-banner-view.tsx`
- Modify: `src/app/globals.css`

- [ ] Use presentation width and height identifiers to render visibly distinct sizes.
- [ ] Add CSS-only gradient and star effects guarded by `prefers-reduced-motion`.
- [ ] Run `node_modules/.bin/tsc.cmd --noEmit`; expect pass.

### Task 3: Full-page draft preview

**Files:**
- Modify: `src/components/admin/topup-banner-studio.tsx`

- [ ] Replace template cards with a select field, retain width and height selectors, and remove layout selector.
- [ ] Add an «عرض على الصفحة» dialog with mobile/desktop page simulation using draft tiers and the shared banner view.
- [ ] Run focused test, typecheck, lint, build and `git diff --check`.
