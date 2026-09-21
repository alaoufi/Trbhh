# Public homepage launch

> Execute the approved design with parallel release verification. The user has authorized implementation and production deployment; do not repeat design approval.

**Goal:** A visitor opening `https://trbhh.sa/` on mobile sees the approved navy/gold-orange presentation, backed by the existing public marketplace.

**Architecture:** Keep the current homepage queries and eligibility rules. Reuse `CommerceHero` and the existing dynamic grid layout with a marketplace card that preserves ad pricing, location, verification and links. Do not call the supplier catalog or commerce checkout from the public home. No schema/data/commerce-setting changes.

**Sequence:** Homepage implementation, tests, fresh preservation backup and isolated restore, production deployment, external mobile/desktop verification; only then inspect and deliver the existing National Day theme, then the existing Salla merchant authorization link.

- [ ] Add a pure hero adapter using public ads only, with a permanent brand slide and bounded live ad slides; test absent/hidden prices and rental semantics.
- [ ] Reuse the approved accessible carousel with a configurable label, eyebrow and heading level; preserve the existing shop defaults.
- [ ] Add a homepage visual card and dynamic grid while retaining explicit member layout preferences and all feed IDs/order.
- [ ] Connect these components at `src/app/page.tsx`; preserve category filtering, search, promotions, personalization, ratings, store cards and links. Hide empty content sections.
- [ ] Run unit suite, typecheck, lint, build and an isolated mobile preview; review changes independently.
- [ ] Take a fresh production DB/code/image checkpoint with verified existing media archives, and prove an isolated restore. Keep purchasing, payments, supplier live orders and automatic product publication off.
- [ ] Deploy only the reviewed commit to the production branch. Verify actual container/image, public response and mobile rendering on `/` outside the server. Recheck preservation.
- [ ] After the homepage is visibly live, continue National Day theme and existing Salla authorization, without recreating OAuth or starting product-image Issue #5.

Rollback: restore the previous application image/code using the checkpoint; retain the same database and storage mounts. No destructive migration or automatic public supplier product activation is part of this release.
