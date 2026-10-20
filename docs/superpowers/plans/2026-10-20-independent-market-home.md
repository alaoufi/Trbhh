# Approved independent market homepage implementation

Risk P2: deterministic public category discovery; no finance changes.

- [x] Keep the previous homepage branch, hero, global color designs and flags.
- [x] Add independent home_theme cookie with market default and classic fallback selectable in existing design menu/account page.
- [x] Implement approved compact market hub with category navigation, source-based opportunity tiles, real ad links, and paused accessible carousel.
- [x] Select from active configured categories with Riyadh daily rotation, bounded existing public search reads, category/seller diversity and ID/title deduplication. Empty categories use navigation/icons without inventory claims.
- [x] Integrate and verify default, classic, selected category and discovery-disabled cases.
- [x] Browser verify actual components on phone/desktop, theme persistence and timer behavior.
- [x] Run mandatory checks, independent review and pin code-only deployment against verified live baseline.

Verification: 48 focused tests passed. Full suite before final heading/menu assertion additions: 3594 passed, 9 skipped; two Prisma CLI child processes timed out under parallel load. Both affected suites passed unchanged on isolated rerun (36 tests). TypeScript and scoped ESLint passed. Browser fixtures imported actual components with local public-content snapshots and mocked Next infrastructure: 1440/390px verified 8/3 columns, category menu36 links, four distinct category tiles with null-image fallback, carousel paging, classic/market persistence through reload, and unchanged generic design=shop cookie. Separate real-component motion checks verified 6s playback, hover/user pause and reduced-motion suppression. Independent reviews found one missing h1; fixed and regression asserted.

Public inventory is queried through the existing visibility-filtered search service (max6 categories x3 ads); no new raw SQL, supplier mutation, payment or public buying changes. Seller diversity uses available public names/store IDs as a heuristic; no claim of identity verification. Unknown-category seed records are excluded from this category-scoped module. Empty navigation uses icons without fabricated images or offers. The prior homepage branch, legacy color designs, promotional slots and settings remain. Home theme affects layout only and can be reverted via existing design menu/account page.

Local production build logs contain missing DATABASE_URL diagnostics from the disconnected environment; successful compilation is not production data validation. Live version checked before release preparation: fdb25312f2ad31dbed9edc513a080ef9eaba203d. Deployment remains code-only with original runtime/product/receipt guards. No server deployment has been performed from this work.
