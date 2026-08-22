# Strict Phone Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent account creation or login until a Saudi mobile number completes OTP verification, and route international numbers to an administrator-reviewed queue.

**Architecture:** A pure Saudi phone helper decides routing. A dedicated registration-intent table holds the password hash and OTP independently from password reset. International requests remain separate from users until an administrator approves one.

**Tech Stack:** Next.js 16 server actions, React, Prisma/MySQL, Vitest, TypeScript.

---

### Task 1: Phone policy and schemas

**Files:**
- Create: `src/lib/phone-registration.ts`
- Create: `tests/unit/phone-registration.test.ts`
- Modify: `src/data/schema-sync.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write the failing policy test**

```ts
import { describe, expect, test } from 'vitest';
import { normalizeSaudiRegistrationPhone, isSaudiRegistrationPhone, registrationRouteForPhone } from '@/lib/phone-registration';

describe('Saudi registration phone policy', () => {
  test('canonicalizes supported Saudi representations', () => {
    expect(normalizeSaudiRegistrationPhone('+966 50 123 4567')).toBe('0501234567');
    expect(normalizeSaudiRegistrationPhone('00966501234567')).toBe('0501234567');
    expect(normalizeSaudiRegistrationPhone('501234567')).toBe('0501234567');
  });
  test('routes international numbers to manual review', () => {
    expect(isSaudiRegistrationPhone('00213667214296')).toBe(false);
    expect(registrationRouteForPhone('00213667214296')).toBe('international-request');
  });
});
```

- [ ] **Step 2: Run it and verify the expected missing-module failure**

Run: `node_modules\.bin\vitest.cmd run tests/unit/phone-registration.test.ts`

- [ ] **Step 3: Implement the smallest policy helper**

```ts
export function normalizeSaudiRegistrationPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('00966') ? `0${digits.slice(5)}`
    : digits.startsWith('966') ? `0${digits.slice(3)}`
    : digits.startsWith('5') ? `0${digits}` : digits;
  return /^05\d{8}$/.test(local) ? local : null;
}
export const isSaudiRegistrationPhone = (input: string) => normalizeSaudiRegistrationPhone(input) !== null;
export const registrationRouteForPhone = (input: string) =>
  isSaudiRegistrationPhone(input) ? 'saudi-otp' as const : 'international-request' as const;
```

- [ ] **Step 4: Run the policy test and verify it passes**

Run: `node_modules\.bin\vitest.cmd run tests/unit/phone-registration.test.ts`

- [ ] **Step 5: Add schema-on-read tables and Prisma models**

Add `registration_intents` with canonical phone primary key, name, password hash, referral id, code, expiry, attempts, last-sent and created fields. Add `international_registration_requests` with country, contact data, reason, password hash, status, reviewer metadata and timestamps. Use `utf8mb4`, indexed status/date columns, and no foreign user row before approval.

- [ ] **Step 6: Commit**

```bash
git add src/lib/phone-registration.ts tests/unit/phone-registration.test.ts src/data/schema-sync.ts prisma/schema.prisma
git commit -m "feat: add strict registration phone policy"
```

### Task 2: Dedicated registration OTP

**Files:**
- Create: `src/lib/registration-otp.ts`
- Create: `tests/unit/registration-otp.test.ts`
- Modify: `src/lib/sms.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
test('does not authorize an expired registration intent', () => {
  expect(isRegistrationIntentUsable({ expiresAt: new Date(0), attempts: 0 }, new Date())).toBe(false);
});
test('does not reset attempts when OTP is resent', () => {
  expect(nextRegistrationOtpAttempts(4)).toBe(4);
});
test('allows only five OTP attempts', () => {
  expect(isRegistrationIntentUsable({ expiresAt: new Date(Date.now() + 60_000), attempts: 5 }, new Date())).toBe(false);
});
```

- [ ] **Step 2: Run and confirm the expected missing-helper failure**

Run: `node_modules\.bin\vitest.cmd run tests/unit/registration-otp.test.ts`

- [ ] **Step 3: Implement registration-only OTP operations**

Implement `startSaudiRegistrationIntent`, `verifyAndConsumeSaudiRegistrationIntent`, `isRegistrationIntentUsable`, and `nextRegistrationOtpAttempts`. Use `registration_intents`, a 10-minute expiry, four-digit OTP, five total attempts, resend cooldown, a registration-specific domestic message, and password hash persistence only. Consume the intent atomically after user creation.

- [ ] **Step 4: Run both suites**

Run: `node_modules\.bin\vitest.cmd run tests/unit/registration-otp.test.ts tests/unit/phone-registration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-otp.ts src/lib/sms.ts tests/unit/registration-otp.test.ts
git commit -m "feat: require isolated OTP for registration"
```

### Task 3: Public registration flow

**Files:**
- Create: `src/app/register/actions.ts`
- Create: `src/app/register/international/page.tsx`
- Modify: `src/app/register/page.tsx`
- Modify: `src/app/login/actions.ts`

- [ ] **Step 1: Confirm existing registration unit tests remain green**

Run: `node_modules\.bin\vitest.cmd run tests/unit/phone-registration.test.ts tests/unit/registration-otp.test.ts`

- [ ] **Step 2: Replace direct user creation with staged actions**

`startRegistrationAction` validates terms/name/password and starts a Saudi intent or routes to the international form. `confirmSaudiRegistrationAction` verifies/consumes the intent, creates the user, then creates the session. Remove direct user creation from old `registerAction`.

- [ ] **Step 3: Build the international request form**

Require country, name, international phone, email, reason, password and terms. `submitInternationalRegistrationAction` stores a pending request, creates neither user nor session, and displays a pending-review message. Do not put a password in a URL.

- [ ] **Step 4: Validate and commit**

Run:
`node_modules\.bin\vitest.cmd run tests/unit/phone-registration.test.ts tests/unit/registration-otp.test.ts`

Run:
`node_modules\.bin\eslint.cmd src/app/register src/app/login/actions.ts src/lib/phone-registration.ts src/lib/registration-otp.ts tests/unit/phone-registration.test.ts tests/unit/registration-otp.test.ts`

Run:
`node_modules\.bin\tsc.cmd --noEmit`

```bash
git add src/app/register src/app/login/actions.ts
git commit -m "feat: gate Saudi registration behind OTP"
```

### Task 4: International review queue

**Files:**
- Create: `src/app/admin/international-registrations/page.tsx`
- Create: `tests/unit/international-registration.test.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/admin-menu.tsx` if used by current navigation

- [ ] **Step 1: Write the failing review-decision test**

```ts
import { expect, test } from 'vitest';
import { isInternationalReviewDecision } from '@/lib/phone-registration';

test('accepts only approve or reject review decisions', () => {
  expect(isInternationalReviewDecision('approve')).toBe(true);
  expect(isInternationalReviewDecision('reject')).toBe(true);
  expect(isInternationalReviewDecision('delete')).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node_modules\.bin\vitest.cmd run tests/unit/international-registration.test.ts`

- [ ] **Step 3: Add helper, queue and protected actions**

Add `isInternationalReviewDecision`; then add pending/approved/rejected tabs showing country, name, phone, email, reason and time. Approve in a transaction only when contact data has no user conflict, create an account without a session, and mark the request approved. Reject stores a reason; destructive deletion is separate and confirmation-gated.

- [ ] **Step 4: Add protected navigation and validate**

Add a pending count without exposing request data outside the authorized page.

Run:
`node_modules\.bin\vitest.cmd run tests/unit/phone-registration.test.ts tests/unit/registration-otp.test.ts tests/unit/international-registration.test.ts`

Run:
`node_modules\.bin\eslint.cmd src/app/admin/international-registrations src/app/admin/actions.ts src/app/admin/page.tsx src/lib/phone-registration.ts src/lib/registration-otp.ts tests/unit`

Run:
`node_modules\.bin\tsc.cmd --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/international-registrations src/app/admin/actions.ts src/app/admin/page.tsx tests/unit/international-registration.test.ts
git commit -m "feat: add international registration review queue"
```

### Task 5: Trbhh-only release

**Files:** none unless validation finds a defect.

- [ ] **Step 1: Re-run full focused verification**

Run affected unit suites, focused ESLint, TypeScript, and:
`git diff --check origin/claude/hostinger-vps-project-amw8vb...HEAD`

- [ ] **Step 2: Protect production**

Create a timestamped rollback tag at current production remote SHA. Run `.github/workflows/fetch-full-backup.yml` and wait for a successful Trbhh backup before any push.

- [ ] **Step 3: Deploy only Trbhh**

Push reviewed HEAD to `origin/claude/hostinger-vps-project-amw8vb`; do not push or merge `staging`.

- [ ] **Step 4: Verify actual deployment**

Wait for deployment workflow conclusion, then make read-only requests to `https://trbhh.sa/register` and `https://trbhh.sa/register/international`. Confirm no Agar workflow ran.

- [ ] **Step 5: Report evidence**

Report commit SHA, backup run, deploy run, rollback tag, test output and any limitation. Do not claim live completion without successful workflow and public checks.

