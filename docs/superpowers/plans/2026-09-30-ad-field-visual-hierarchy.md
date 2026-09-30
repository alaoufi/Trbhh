# Ad Field Visual Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make category-specific ad fields compact, grouped, and visually distinguish required and optional inputs while showing red validation feedback only after a failed submit attempt.

**Architecture:** Keep `AdCategoryFields` as the single renderer and add local invalid-key state driven by native `invalid` events. Apply stable data attributes and Tailwind classes at field-card and group boundaries so unit and browser checks can verify behavior without changing category data contracts.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, React server rendering, Playwright preview checks.

---

### Task 1: Lock visual and validation behavior with tests

**Files:**
- Modify: `tests/unit/ad-category-fields.test.ts`

- [ ] **Step 1: Write failing markup tests**

Add assertions for `data-field-group`, `data-required`, red required styling, green optional styling, compact spacing, and required range controls.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test -- tests/unit/ad-category-fields.test.ts`

Expected: FAIL because the new semantic attributes and required range behavior do not exist yet.

- [ ] **Step 3: Keep the failure focused**

Confirm the failure references the new visual hierarchy assertions rather than an unrelated import or environment error.

### Task 2: Implement compact grouped field cards and invalid state

**Files:**
- Modify: `src/components/ad-category-fields.tsx`

- [ ] **Step 1: Add local invalid state helpers**

Use `Set<string>` state, mark keys from each control's `onInvalid`, and clear them from value updates.

- [ ] **Step 2: Apply compact group and field layouts**

Use `space-y-2`, `gap-2`, compact group padding, and field cards with required red or optional green backgrounds.

- [ ] **Step 3: Apply accessible invalid feedback**

Set `aria-invalid`, connect controls to one error message using `aria-describedby`, and apply a strong red border/ring only after native validation fails.

- [ ] **Step 4: Require both range endpoints when configured**

Add `required={f.required}` and invalid handlers to both range inputs while retaining their existing value shape.

- [ ] **Step 5: Run focused tests**

Run: `pnpm test -- tests/unit/ad-category-fields.test.ts tests/unit/ad-category-dynamic-ui.test.ts`

Expected: PASS.

### Task 3: Extend the browser contract

**Files:**
- Modify: `tests/preview/browser.cjs`

- [ ] **Step 1: Add stable visual hierarchy assertions**

Assert that a required field has `data-required="true"`, an optional field has `data-required="false"`, and grouped fieldsets expose `data-field-group`.

- [ ] **Step 2: Preserve existing dynamic-field assertions**

Keep all current category-switching and conditional-field checks unchanged.

### Task 4: Update member and admin guides

**Files:**
- Modify: `src/app/guide/page.tsx`
- Modify: `src/app/guide/store/page.tsx`
- Modify: `src/app/admin/guide/page.tsx`

- [ ] **Step 1: Document member-facing visual meaning**

Explain that light red cards are required, light green cards are optional, and strong red borders identify missing required values after submission.

- [ ] **Step 2: Document admin behavior**

Clarify that required/optional styling follows the saved field setting automatically and does not override admin configuration.

### Task 5: Verify and save the branch

**Files:**
- Test: `tests/unit/ad-category-fields.test.ts`
- Test: `tests/unit/ad-category-dynamic-ui.test.ts`
- Test: `tests/preview/browser.cjs`

- [ ] **Step 1: Run focused tests**

Run: `pnpm test -- tests/unit/ad-category-fields.test.ts tests/unit/ad-category-dynamic-ui.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run repository quality gates**

Run: `npx tsc --noEmit`, `pnpm lint`, `pnpm build`, and `pnpm test`.

Expected: zero new errors; existing warnings are reported separately.

- [ ] **Step 3: Review the branch diff**

Confirm no schema, migration, payment, supplier-order, or production configuration changes exist.

- [ ] **Step 4: Synchronize safely and commit**

Fetch the remote branch, compare local and remote HEAD, preserve any remote advancement, then commit in Arabic and push only the current feature branch.

- [ ] **Step 5: Verify staging visually**

Open the staging ad form at desktop and mobile widths, exercise native required validation without creating an ad, and confirm no new entry appears in `/admin/errors`.

