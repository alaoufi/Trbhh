# Ad publishing visibility and moderation repair — 2026-10-22

Risk: P2. User requested review of member/store ad creation and less aggressive duplicate rejection, prioritizing actual visibility. Production version was rechecked as 2040b06b. No live writes, charges, deployment, moderation setting changes, account unbans or retroactive ad updates were performed.

Confirmed causes and changes:
- Four repeated service bigrams or twelve uses of any word previously rejected otherwise useful descriptions. Repetition now requires substantial text dominance; repeated keyword/long phrase blocks remain blocked.
- Same-member duplication previously matched either title, description, or a perceptually similar image. Require both title and description, retaining configured similarity thresholds. Shared images are not standalone evidence. Limit source comparisons to active public-platform ads; cross-member evidence additionally requires substantial description text, not a short generic trade label.
- Store publication previously committed a store-only ad, invalidated caches, and then swallowed showcase-link insertion failure. Resolve the eligible store first and insert membership in the existing category/ad transaction. Failure propagates and rolls back the transaction. Use the same resolved store for the success destination. Notify followers only after immediate publication; no second showcase write.
- Revalidate public/search/account and selected-store surfaces after persistence. Missing stores produce an explicit form error before creation. Approval and scheduling outcomes take precedence over the censored-publication success message.

Validation:
- Regression tests reproduced both natural-description false positives and all three store-publication failures before changes.
- Focused publication/moderation/store/product/visibility suites passed (73 before two outcome cases and an additional long-block case; the new outcome suite passes 9 and updated text suites pass 13).
- Full suite: 3614 passed, 9 skipped, two Prisma child-process ETIMEDOUT failures. Both unchanged suites passed in isolation with 36 tests; no assertion or timeout modifications.
- Repository ESLint excluding untracked work/ fixtures: 0 errors, 7 existing warnings. Unqualified pnpm lint includes untracked historical browser fixtures and reports their three unrelated errors; those are not shipped.
- TypeScript and final production build passed. Scope-reviewed original contact, image safety, package quotas, optional paid-extra pricing/source IDs, approval, scheduling, storefront isolation, and lifecycle visibility enforcement retained.

Pending live evidence: user identified an employment listing titled with the Otad Sudair student bookstore name. A read-only SSH query was supplied to identify its persisted state, approval, scheduling, archive/lifecycle and store membership. No output received yet. The exact member report cannot be claimed resolved from local tests alone. No authenticated production publish test or real financial action was executed. Future publish fixes do not repair existing orphan store links automatically.
