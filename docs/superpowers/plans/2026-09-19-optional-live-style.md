# Optional live application style implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review this plan.

**Goal:** Offer the V2 visual language as an opt-in presentation of the existing server application, using its actual ads, images and settings rather than a second database or static fixtures.

**Architecture:** Keep existing production queries, routes, permissions and financial actions unchanged. Extend the existing design cookie with a validated `v2` option gated by an administrator setting, disabled by default. Render V2 cards from the same AdCard data objects and style the public shell without affecting independent storefronts or payment/admin pages. Static Sites remains explicitly a snapshot; publishing a server-integrated preview requires a safe isolated runtime, not production credentials in a static bundle.

**Tech stack:** Existing Next.js server application, React, TypeScript, MySQL settings, Vitest, Playwright.

## Safety and baseline

- [x] Verify linked preview worktree and exact origin; create backup branch.
- [x] Merge current production fixes into preview only to retain card-payment and HEIC fixes.
- [x] Install locked dependencies and run unit baseline (278 tests). No production database connection.

## Task 1: Shared server-backed optional presentation

Files: create `src/lib/site-design.ts`, `src/components/site-design-provider.tsx`, `src/app/v2-design.css`, `tests/unit/site-design.test.ts`; update `src/components/design-picker.tsx`, `src/app/account/design/page.tsx`, `src/components/ad-card.tsx`, `src/app/layout.tsx`, `src/components/chrome-gate.tsx`, `src/lib/ux-settings.ts`, `src/lib/settings.ts`, and home public presentation hooks only as necessary.

- [x] Write failing tests for `resolveSiteDesign(raw, enabled)`: empty/unknown => classic; legacy allowed IDs preserved; `v2` requires enabled. Test public settings projection returns only enabled/label/description, never arbitrary settings.

```ts
expect(resolveSiteDesign('v2', false)).toBe('');
expect(resolveSiteDesign('v2', true)).toBe('v2');
expect(resolveSiteDesign('unknown', true)).toBe('');
expect(resolveSiteDesign('shop', false)).toBe('shop');
```

- [x] Observe feature-test failure, then implement the pure allowlist resolver and settings adapter; run Vitest through the installed test script.
- [x] Register `v2_design_on` (fallback false), `v2_design_label` and `v2_design_description` in existing admin-editable UX settings. Only read these public values for the client provider. Handle settings error by disabling V2.
- [x] Resolve cookie on server, share server-resolved config with all design pickers via provider. Existing design choices remain. `applyDesign` validates ID, writes only appearance cookie and refreshes server components when markup changes; guard browser access. Hidden V2 cannot be selected through a stale cookie or gallery.
- [x] V2 cards use original AdCard image/title/price/link/location/date and real feature labels, no fabricated fields. Render 2 mobile / 4 desktop columns, white rounded cards, restrained borders/shadows, V2 paper/ink/gold tokens. Public home discovery text and search remain actual settings/components. Public shell has scoped design attribute; standalone stores, admin and payment pages retain original presentation.
- [x] Verify feature-off renders existing presentation, feature-on alone does not change default, selected V2 applies across navigation and refresh, disable returns default, classic switch resets style. No schema changes, database copies, snapshot imports, payment modifications or production writes.

## Task 2: Documentation and verification

- [x] Update all three user/admin/store guides with optional preference and shared data semantics. Admin guide states default-off and rollback switch. Record static-vs-live deployment boundary honestly.
- [x] Root TypeScript passed; pinned pnpm 9.15.9 lint passed (five existing warnings), 296 unit tests passed, production build passed with disposable MySQL (existing middleware/tracing warnings).
- [x] Independent spec review passed; independent quality review passed after contrast and shared-selection fixes. Real authenticated cross-selector runtime check passed.
- [x] Browser-check desktop/mobile layout and switching in an isolated fixture harness and real local runtime with disposable MySQL. Production DB runtime remains unverified.
- [x] Compare payment/auth/database files against production to ensure this task did not modify them. Do not push production, change live settings, publish static output as live, or disclose secrets.

## Evidence-driven adjustment

The real MySQL smoke test found an existing unlimited-default-plan search visibility bug: an empty predicate within `OR` is not a true branch in Prisma. Fixed the pure predicate builder only, with regression tests, and repeated the same-database search smoke test successfully. This is an intentional narrow deviation from preserving every query shape; it restores the previously intended unlimited-plan behavior without changing any stored ad or plan.

Independent quality review found low contrast and stale independent selector state. Added accessible contrast tokens and one server-seeded shared selection provider; ten visual tests and authenticated menu/gallery runtime checks passed after fixes.

## Deployment boundary

The existing public Sites URL is static. A true active-DB preview requires an approved isolated server runtime with a read-only DB identity, or a controlled release into the existing server application. The production application has schema-sync, scheduled-ad promotion and lifecycle writes, so pointing a full second app at the live writable database is not a safe preview. Implementation can be prepared and tested without claiming this deployment is complete.
