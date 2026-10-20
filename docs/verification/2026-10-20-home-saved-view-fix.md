# Homepage saved-view precedence correction

Risk P3. Live baseline fdb25312f2ad31dbed9edc513a080ef9eaba203d.

Root cause reproduced by anonymous HTTP requests: default homepage returned four data-home-feed-grid wrappers and 42 marketplace cards, while sending design=shop returned zero marketplace grids and two legacy four-column shop grids. design=list also bypassed the explicit homepage appearance. Earlier browser fixtures rendered marketplace cards directly and did not cover the actual AdGrid selection path.

The explicit marketplace appearance now takes precedence over the generic saved design. Every current caller with this appearance belongs to the homepage; callers without it retain their existing saved-view behavior. Homepage-only borders and shadows are lighter. No copied logos, pictures, text, source code or brand elements from the reference site were introduced.

Regression tests: five cases cover default/shop/list with explicit appearance plus shop/list without it. Before the fix both saved-view homepage cases failed; after the fix all five passed. Local browser fixtures now invoke actual AdGrid and use real browser cookies forwarded by a mocked Next headers boundary. All six combinations of design default/shop/list at 390px and 1315px passed: 2/6 columns, correct ad link and no horizontal overflow or page error. Local synthetic images are used only in fixtures; no production content was changed.

TypeScript and scoped ESLint passed. Publisher preflight: 11 passed. Independent review: no blockers. No production deployment or financial operation was performed. Build and full-suite results recorded before committing below.

Production build passed. Full suite: 3576 passed, 9 skipped, two Prisma CLI subprocess timeouts. After build finished, both affected suites passed unchanged with one worker (36 tests); a recheck performed while build was active had still timed out once. No assertion or timeout was relaxed.
