# Homepage catalog implementation plan

Approved scope: compact homepage inspired by supplied desktop and mobile screenshots. Risk P3. Preserve all source records, ordering, publication switches and financial gates.

- [x] Inspect existing homepage, card and category composition.
- [x] Expose category navigation outside collapsible search; place search before promotional hero.
- [x] Apply homepage-only fixed 2/3/4/6 marketplace tracks and square images; preserve alternative list/shop designs and optional dense padding.
- [x] Add composition regressions for one visible category navigation and search ordering.
- [x] Verify actual components in a browser at phone/tablet/desktop widths, including a short last row and link destinations.
- [x] Run unit tests, TypeScript, ESLint and production build; independently review diff.
- [x] Pin verified live baseline and prepared candidate in deployment script, without live publication or financial actions.

Verification: 3566 unit tests passed, 9 skipped. TypeScript, scoped ESLint and production build exited successfully. Local browser fixture uses actual marketplace cards, search and CSS with synthetic content and only Next infrastructure mocks: 390/768/1100/1440px verified 2/3/4/6 tracks, square images, unchanged short-row width, valid ad destinations and no horizontal overflow. Screenshots inspected at phone and desktop widths. Composition tests cover real homepage hierarchy and disabled search setting. No database-backed production UI review was performed; local build logs lack DATABASE_URL and do not establish live data behavior. Independent review found an empty disabled-search control; fixed and regression tested. No financial or store-state mutation. Live baseline verified as 0432f1aee3d13f4c2fd9910e5931ded7c6a81fd4; deployment script preserves runtime and performs existing release/receipt probes.
