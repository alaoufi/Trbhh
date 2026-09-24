# CJ product detail and trial-cart readiness

## Constraints

- Work only on `codex/cj-product-page-20260924`; production deployment and real orders remain disabled.
- Preserve CJ source text and internal identifiers. Never invent product fields or disclose credentials.
- A selectable variant must pass a fresh variant-specific stock lookup and Saudi freight quote for the requested quantity.
- Trial cart records the exact verified quote snapshot; cart review revalidates it. Any changed price, stock, or shipping blocks continuation pending user review.

## Stages

1. Establish the clean branch checkpoint and isolate reproducible inventory mapping/availability defects with unit tests.
2. Add strict CJ variant verification that parses supported inventory response shapes, maps only exact VIDs, quotes freight per selected VID/quantity and origin, and returns customer-safe failures.
3. Add a staff-only no-store verification endpoint. Keep both central purchase and supplier live-order guards untouched.
4. Rebuild the product selection UI around parsed options, current per-variant amount, live availability, freight choices, ETA, safe component breakdown, and add-to-trial-cart only after verification.
5. Extend trial cart snapshots and cart review revalidation without any CJ order-creation call. Keep supplier IDs/options only in internal snapshots.
6. Improve source-preserving display cleanup, dynamic specs, mobile gallery gestures, and mobile spacing/navigation collision fixes.
7. Run focused tests, full tests, typecheck, lint, and production build. Commit milestones and push the feature branch; do not deploy.

## Verification

Inject CJ responses in tests for 24 variants, exact VID matching, stock by warehouse, empty/malformed/failing inventory, unavailable/failed freight, quantity boundaries, price changes, missing images, TEST mode, and central LIVE disabled. Browser-preview the product/cart at 360–430px with no horizontal overflow. Explicitly verify create-order is never invoked.
