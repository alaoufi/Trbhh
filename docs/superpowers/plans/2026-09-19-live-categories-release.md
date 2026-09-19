# Approved live categories release

User explicitly requested immediate completion and deployment on 2026-09-19. This supersedes the development-only boundary of earlier plans. Existing ads, users, credentials, stores, media and wallet/payment integration must remain intact. New commerce checkout and supplier API stay disabled.

Verified starting revision: `ec75f2862079107c742d8b8d903c24c5da5748da` on `alaoufi/Trbhh`, production branch `claude/hostinger-vps-project-amw8vb`. Candidate worktree: `codex/commerce-approved-goods-20260919`.

- [x] Complete homepage category navigation, additive/idempotent template activation, and release baseline guards. Independently review.
- [ ] Run unit/integration/typecheck/lint/build/browser checks; commit in Arabic and push candidate branch only. Check Linux CI.
- [ ] Run private production code/image/environment/database/media backup and isolated restore proof. Record verified backup ID and rollback image before production push.
- [ ] Fast-forward production explicitly only if its revision still matches the reviewed baseline. Wait for actual deployment.
- [ ] Run post-deployment preservation verification before changing rollout settings.
- [ ] Activate templates/categories explicitly using verified-backup and exact deployed-revision gates. Never rewrite old ads or modify existing wallet settings. New financial/API switches remain off.
- [ ] Verify public homepage, category filtering, member access boundary, store routes, media, and production category schema/flags. Report actual URL, release revision, backup ID, evidence and remaining disabled integrations.

Rollback: before activation the old image tag and code/environment/media/database are preserved under the verified private backup directory. New schema is additive; prefer switching application image back and disabling category rollout without restoring database over newer member activity. Database restoration is an exceptional recovery operation, not automatic rollback.

## Execution evidence

- Initial candidate `0caa5a78fa858044a1772437d69baf5cad50ab96` pushed to feature branch only. Linux CI `35458426475` passed, including real authentication transactions.
- Fresh backup/restore workflow `35458433720` dispatched against verified production baseline; deployment remains gated on its success.
- Historical upgrade fixture passed two schema boots with an explicit 130-column additive allowlist; existing rows, passwords and sessions preserved.
- Guest browser caught the existing empty-OR unlimited-plan search predicate bug. A focused regression fix and browser rerun are required before production fast-forward.
- Final local patch verification: 631 unit tests passed; eight opt-in MySQL visibility tests passed separately. Production build/typecheck and ESLint passed (five existing lint warnings). Guest/member/admin browser passed, including selected-category results, clear-filter reset and 320px layout. Dead-end unconfigured category choices are excluded only from the ad form, not legacy browsing. Independent final patch review approved.
