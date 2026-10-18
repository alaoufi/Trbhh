# Product image zoom implementation plan — 2026-10-18

Approved: desktop hover magnifier and mobile touch zoom on every product-detail gallery, inspired by user-supplied 1688 screenshots. Retain Trbhh identity. P2 UI interaction only; no prices, checkout, payments, public-store gates or database changes.

- [x] Add shared zoom geometry and interaction wrapper. Test image contain offsets, edges, pinch/pan limits, source reset and accessible dialog.
- [x] Integrate CJ, approved CJ, ads/company products and commerce detail galleries. Keep gallery navigation, fallback images and supplier variant selections.
- [x] Verify size guidance stays directly below size options; product measurement tables remain product-specific, approximate conversions clearly labelled. Do not invent measurements from screenshots.
- [x] Independently review then run relevant and full unit tests, TypeScript, ESLint and production build. Browser-check desktop hover and touch dialog using local fixture without production writes.
- [x] Commit/push non-auto-deploy branch. Update existing code-only publisher pinned baseline to production 8b08458e and generate one pinned SSH script, retaining access/receipt checks and no financial writes.
