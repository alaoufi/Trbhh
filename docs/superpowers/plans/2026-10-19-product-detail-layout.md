# Product detail organization — 2026-10-19

Approved design: user supplied1688 reference and authorized suitable changes plus one deploy code. Preserve Trbhh identity, all price/variant/cart/payment gates, authentic source content; no fabricated reviews or product measurements.

Architecture: shared server-rendered ProductSectionNav with native anchors, scoped explicit target IDs and safe labels. CJ and commerce use two columns desktop, one mobile; purchase controls near gallery, detailed sections below full width. Size guide stays next to relevant selectors. No sticky tall purchase panel or hidden tab content. Existing zoom retained.

- [x] Build/test native section navigation and accessible target landmarks.
- [x] Organize CJ source and approved preview detail pages without changing server reads/management actions.
- [x] Organize commerce detail sections, move general size guide adjacent to selection, preserve payment controls and cart/stock behavior.
- [x] Independently review, scoped/full tests, lint/typecheck/build, browser responsive fixture validation.
- [x] Commit and push non-auto branch. Prepare one pinned code-only release including earlier Lumi and admin price changes, preserving runtime, media, financial data and purchase flags; stop if live baseline differs.
