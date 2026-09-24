# TRBHH Commerce Purchase Journey

## Scope and safety

Improve the approved commerce journey from public product detail through cart and checkout readiness. Preserve existing CJ, finance, tax, agent, and RBAC modules. Keep `commerce_purchasing_enabled` and production payments OFF. Do not create real orders or contact CJ/payment providers during this work. All schema changes are additive and backward-compatible; order address data is an immutable snapshot.

## Checkpoints

1. **Address book foundation** — add additive address-table DDL and strict Saudi address normalization/validation; unit-test required fields, phone/postal formats, ownership-safe operations, and default-address behavior. Commit the plan plus tests/implementation after tests pass.
2. **Account address management** — add `/account/addresses` CRUD/default UI and server actions bound to the signed-in member; server-side validation and ownership predicates; add integration coverage if the configured MySQL test environment is available.
3. **Order address snapshot** — extend the order shipping snapshot additively with address components while continuing to parse legacy snapshots; ensure request fingerprint includes the entire normalized address; reject incomplete snapshots server-side; preserve invoice snapshot linkage. Test immutability and idempotent replay.
4. **Product detail and cart** — replace the current checkout-as-product-page with a mobile-first PDP, safe gallery/fallback, sanitized public fields/options, price/discount/stock/shipping sections, and a cart that never leaks supplier/CJ internal data. Add UI/logic tests for options, missing fields, safe labels, and disabled purchase behavior.
5. **Checkout readiness** — render address → items → delivery estimate/fees → VAT-aware totals → disabled payment/submit state while purchasing is OFF; when later enabled, force address selection and revalidate active price/stock/shipping on the server immediately before order creation. Preserve gateway and idempotency boundaries.
6. **Verification and release checkpoint** — run targeted tests, full unit/integration suite, TypeScript, lint, and production build; fix regressions within scope. Commit and push each stable checkpoint. No production deploy in this task.

## Acceptance criteria

- Missing/invalid Saudi address data is rejected at the server boundary before order creation.
- Multiple addresses and one selected default are scoped to the authenticated member.
- Every order records a complete address snapshot; changing an address later cannot change an existing order/invoice.
- Catalog and PDP never expose supplier names, source IDs, cost, margin, or API data.
- Missing product attributes disappear cleanly; no invented ratings, delivery claims, or discount values.
- Product/cart UI works on narrow screens and clearly separates merchandise, discounts, shipping, VAT, and total.
- Central shopping and payment gates remain OFF; disabled UI is backed by server-side refusal.
- Existing CJ trial, finance/tax, RBAC, and supplier integration behavior remains intact.
