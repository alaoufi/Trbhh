# Private Al Rajhi Submit Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the private Al Rajhi top-up form a safe default amount and an unmistakable pending state before redirecting to the bank.

**Architecture:** Keep the page as an authorized server component. Extract only the form into a client component that uses React `useFormStatus`, so the server action and its financial controls are not altered. The new component is purely presentation and duplicate-submit protection.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Cover the required private-form contract

**Files:**
- Create: `tests/unit/alrajhi-private-topup-form.test.ts`
- Create: `src/app/admin/payments/private-topup/private-topup-form.tsx`

- [ ] Write a failing Vitest test that expects `PRIVATE_ALRAJHI_DEFAULT_AMOUNT` to equal `50` and `PRIVATE_ALRAJHI_PENDING_MESSAGE` to contain `لا تغلق الصفحة`.
- [ ] Run `npm.cmd test -- tests/unit/alrajhi-private-topup-form.test.ts` and verify the missing-module failure.
- [ ] Add the minimal client form module with those exports and a `useFormStatus` pending UI.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Attach the form without changing payment logic

**Files:**
- Modify: `src/app/admin/payments/private-topup/page.tsx`

- [ ] Replace only the inline form with `PrivateAlrajhiTopupForm`, passing the existing action, readiness, and configured bounds.
- [ ] Run the focused test and `npm.cmd typecheck`.
- [ ] Commit only the page, form, test, design, and plan files after successful validation.
