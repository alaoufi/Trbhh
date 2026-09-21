# Supplier visual selection

**Goal:** Replace manual product-number selection with a searchable Salla product catalog, full preview and multiple selection followed by explicit administrator review.

**Approved design:** The user's requested cards/table, name/SKU search, preview and “إضافة إلى تربح” actions are the specification. Use responsive cards consistent with existing navy/gold administration UI. No redesign of other pages.

**Architecture:** Read existing supplier_products and Salla connection/profile data through bounded, permission-checked server actions. Keep internal keys out of visible labels. Review re-reads current products and issues an administrator-bound, expiring selection token. Confirming revalidates revisions, supplier state and prices, and atomically reuses existing product pricing/mapping behavior with active/visible/featured all false. No migrations, settings changes, new provider flow or automatic publication.

- [x] Search and safe detail DTOs; literal name/SKU matching and pagination.
- [x] Signed review and atomic hidden addition, authorization and stale/replay checks; isolated MySQL concurrency/rollback tests added to CI.
- [x] Responsive cards, preview dialog, persistent selection across searches/pages, review and per-product pricing.
- [x] Replace manual-number entry with catalog entry points; preserve editing existing supplier mappings.
- [x] Local regression tests, typecheck/lint, mobile and desktop interaction checks. CI builds the exact pushed commit and runs isolated MySQL transactions.
- [x] Changes isolated to `codex/supplier-visual-selection-20260921`, based on `415a8fe`; no main merge or production deployment in this task.

Source selling price is never assumed to be negotiated supplier cost. Missing cost requires explicit input during review. Existing public/purchasing/payment/live-order gates remain untouched. Failed or stale batch review must not partially add products.

## Verification

Local unit suite: 1019 passed / 9 existing skips. TypeScript passed. ESLint: zero errors, five existing warnings outside this change. Real browser interactions passed at 1440 and390 pixels using the actual component with clearly labelled synthetic data; see `docs/screenshots/supplier-selection/README.md` and `verification.json`. Screenshots do not claim a live Salla connection or test-store import.

The six isolated MySQL scenarios run through the CI workflow: name/SKU search with the production binary collation, hidden batch success, stale source rejection, replay protection, rollback after the second audit insert and simultaneous approval. Prisma generates Unicode-insensitive table defaults; the isolated empty fixture explicitly applies the supplier module's binary collation before running the unmodified readiness check. No production schema changes are included. Build and database evidence belongs to the GitHub run for the delivered commit.
