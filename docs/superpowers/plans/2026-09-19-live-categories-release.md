# Approved live categories release

User explicitly requested immediate completion and deployment on 2026-09-19. This supersedes the development-only boundary of earlier plans. Existing ads, users, credentials, stores, media and wallet/payment integration must remain intact. New commerce checkout and supplier API stay disabled.

Verified starting revision: `ec75f2862079107c742d8b8d903c24c5da5748da` on `alaoufi/Trbhh`, production branch `claude/hostinger-vps-project-amw8vb`. Candidate worktree: `codex/commerce-approved-goods-20260919`.

- [x] Complete homepage category navigation, additive/idempotent template activation, and release baseline guards. Independently review.
- [x] Run unit/integration/typecheck/lint/build/browser checks; commit in Arabic and push candidate branch only. Check Linux CI.
- [x] Run private production code/image/environment/database/media backup and isolated restore proof. Record verified backup ID and rollback image before production push.
- [x] Fast-forward production explicitly only if its revision still matches the reviewed baseline. Wait for actual deployment.
- [x] Run post-deployment preservation verification before changing rollout settings.
- [x] Activate templates/categories explicitly using verified-backup and exact deployed-revision gates. Never rewrite old ads or modify existing wallet settings. New financial/API switches remain off.
- [x] Verify public homepage, category filtering, member access boundary, store routes, media, and production category schema/flags. Report actual URL, release revision, backup ID, evidence and remaining disabled integrations.

Rollback: before activation the old image tag and code/environment/media/database are preserved under the verified private backup directory. New schema is additive; prefer switching application image back and disabling category rollout without restoring database over newer member activity. Database restoration is an exceptional recovery operation, not automatic rollback.

## Execution evidence

- Initial candidate `0caa5a78fa858044a1772437d69baf5cad50ab96` pushed to feature branch only. Linux CI `35458426475` passed, including real authentication transactions.
- Fresh backup/restore workflow `35458433720` dispatched against verified production baseline; deployment remains gated on its success.
- Historical upgrade fixture passed two schema boots with an explicit 130-column additive allowlist; existing rows, passwords and sessions preserved.
- Guest browser caught the existing empty-OR unlimited-plan search predicate bug. A focused regression fix and browser rerun are required before production fast-forward.
- Final local patch verification: 631 unit tests passed; eight opt-in MySQL visibility tests passed separately. Production build/typecheck and ESLint passed (five existing lint warnings). Guest/member/admin browser passed, including selected-category results, clear-filter reset and 320px layout. Dead-end unconfigured category choices are excluded only from the ad form, not legacy browsing. Independent final patch review approved.

## Live release evidence — 2026-09-19

- Live application revision: `021c5fe43f9a6361f7a0df66bf35e92f38e0cf06`.
- Backup `35458433720` failed its 15-minute pause guard; it is NOT verified. Production resumed automatically. The subsequent run reused only copied media archives after content validation, with a fresh database dump and independent restore proof.
- Verified backup `35459832130`: all 158 tables restored and matched exactly; 2,259 ads, 1,688 users and 21 stores captured. Both media trees matched in both directions (2,028 and 12,825 entries). Code, runtime image, environment and generated runtime manifest are preserved privately on the VPS. Rollback image: `trbhh-rollback:audit-35459832130`; rollback Git tag: `rollback/trbhh-before-categories-20260919`.
- Recovery-script tests raised the unit total to 635 passing. Typecheck, ESLint and build passed; Linux candidate CI `35459825370` and production CI `35460318289` passed.
- Production deployment `35460318285` succeeded at 18:12:56 UTC; public `https://trbhh.sa/` returned HTTP 200.
- Post-deployment preservation run `35460515135` passed: all old protected rows/credentials preserved, connection/signing secret/mounts unchanged, both media trees unchanged. Only two additional ad-view records appeared among existing tables.
- Activation `35460598118` succeeded at 18:15:35 UTC: 8 new parents, 30 subcategories and 30 field definitions; existing parents reused where appropriate. Only `categories_v2_enabled` changed in settings. Existing ads were not reclassified; commerce payments, notifications and supplier API remained disabled.
- Independent public GET checks confirmed category navigation/filtering, populated legacy fallback category, login boundaries for `/ads/new`, `/admin/categories` and `/admin/suppliers`, and disabled `/shop` checkout. Real member login was not attempted on production; isolated authentication tests and live credential preservation checks passed.
- Final live browser PASS at `2026-09-19T18:18:19Z`: category selection/clear, jobs/property and both observed fallback filters, populated legacy results, 320px layout, public store identity/catalog and eight product images; no browser page errors or non-read requests. Private local browser evidence: `commerce-preview-evidence/live-public-2026-09-19T18-18-19-743Z/report.json` and screenshots in the parent project directory. Initial runs exposed a 30-second settings-cache delay and an incorrect test assumption that healthy stores use `h1`; neither required a production code change.
