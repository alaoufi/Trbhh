# Actual homepage and ad detail density correction

Risk P3. User screenshots showed the prior design consumed several rows for search/categories and the actual /ads detail remained full-width. The earlier product-gallery changes did not cover that route.

- Home search is one 44px row with an accessible label, submit, native filter disclosure and inline add-ad link; filter values remain in the GET form.
- All active categories remain reachable in one horizontal scroll row; the visual mode no longer duplicates category links with a select form. Nonvisual mode retains its form.
- Homepage cards use container width rather than device width: 2/3/4/5/6 columns at 0/520/700/900/1100px. Short rows do not expand. Other list/shop layouts remain outside this scope.
- Compact hero uses 140px/180px minimum height with smaller content; regular hero remains unchanged. Separated image presentation is also bounded when compact.
- Actual /ads/[id] groups gallery/media beside existing title, metadata and description at desktop widths. Gallery width is capped at 440px, image frame 240px phone/320px desktop, thumbnails 52px. Existing purchase/contact/review blocks remain outside the new wrappers.

Verification: local browser fixtures import the actual search, category component with 36 supplied categories, hero, marketplace cards and AdGallery; Next infrastructure and content are mocked. At widths 390/1100/1315/1440: search44px, categories44px, hero152/180/180/180px, main ad image236/316/316/316px (inner content). Expected 2/5/6/6 columns, no horizontal overflow, thumbnail selection and zoom dialog passed. Screenshots inspected. Browser fixture does not certify authenticated production rendering or live source records.

TypeScript, scoped ESLint and production build passed. An existing hero test expected the old 230/320px heights; expectations were updated to the approved 140/180px compact sizing, leaving the regular-hero assertion intact. Independent review found no blocker. Publisher preflight: 11 tests passed. No financial invocation, database mutation, public store opening or timer activation performed. Live baseline: 88fa5c2e815836886d4c95f82ef5842cd0ca927e.

Final full suite: 3573 passed, 9 skipped; 437 files passed and 1 skipped.
