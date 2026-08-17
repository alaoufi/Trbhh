# Dynamic Ad Form Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give private Dynamic Ads Lab entities grouped, ordered, configurable fields without changing public ads.

**Architecture:** Add additive SQL schema columns and a group table. Keep validation/types pure and testable; repository maps rows to grouped entities; private admin/lab UI consumes that model.

**Tech Stack:** Next.js server components/actions, TypeScript, Prisma raw queries, MySQL, Vitest, Tailwind CSS.

---

### Task 1: Types and validation

**Files:**
- Modify: `src/lib/dynamic-ads/schema.ts`, `src/lib/dynamic-ads/types.ts`
- Test: `tests/unit/dynamic-ad-schema.test.ts`

- [ ] Write failing tests for `multiselect`, decimal values, and `normalizeDynamicFieldLayout`.
- [ ] Run `npm.cmd test -- --run tests/unit/dynamic-ad-schema.test.ts`; confirm RED because these APIs do not exist.
- [ ] Add `decimal` and `multiselect` field types, `DynamicFieldGroup`, ordered layout data, and strict multi-option validation.
- [ ] Rerun the focused test; confirm GREEN; commit `feat: support grouped dynamic ad field types`.

### Task 2: Additive persistence

**Files:**
- Modify: `database/2026-08-17-dynamic-ads.sql`, `src/lib/dynamic-ads/repository.ts`
- Test: `tests/unit/dynamic-ad-schema.test.ts`

- [ ] Write SQL contract tests for `dynamic_entity_groups`, `input_visible_flag`, and `display_visible_flag`.
- [ ] Run the focused test; confirm RED.
- [ ] Add only `CREATE TABLE IF NOT EXISTS`/additive migration statements, seed a basic group, and map groups/fields in deterministic input and display orders.
- [ ] Rerun focused test; confirm GREEN; commit `feat: persist dynamic ad field groups`.

### Task 3: Admin form builder

**Files:**
- Modify: `src/app/admin/smart-ads/actions.ts`, `src/app/admin/smart-ads/page.tsx`
- Test: `tests/unit/dynamic-ad-schema.test.ts`

- [ ] Write failing input-parser tests for accepted field types and visibility flags.
- [ ] Run focused test; confirm RED.
- [ ] Add protected actions to create groups/save fields, then render entity → groups → fields with field type, option editor, flags, and both ordering inputs.
- [ ] Rerun focused test; confirm GREEN; commit `feat: add dynamic ad form builder controls`.

### Task 4: Private grouped experience

**Files:**
- Modify: `src/components/dynamic-ads/dynamic-ad-form.tsx`, `src/components/dynamic-ads/analysis-report.tsx`, `src/app/lab/smart-ads/actions.ts`
- Test: `tests/unit/dynamic-ad-schema.test.ts`

- [ ] Write failing tests for input grouping and display visibility.
- [ ] Run focused test; confirm RED.
- [ ] Render a mobile RTL group-card form, multi-choice controls, and display-only report values while retaining the private hidden route.
- [ ] Rerun focused test; confirm GREEN; commit `feat: render grouped dynamic ad form`.

### Task 5: Verification and release

- [ ] Run `npm.cmd test -- --run tests/unit/dynamic-ad-*.test.ts`, `npm.cmd run typecheck`, and `npm.cmd run build`.
- [ ] Create a full Trbhh backup, push only after all checks pass, wait for the deploy workflow, and verify `https://trbhh.sa/` returns HTTP 200.
- [ ] Verify the lab under an administrator session and confirm the public legacy add-ad route has not changed.
