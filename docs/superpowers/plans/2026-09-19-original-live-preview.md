# Original design and isolated live preview implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent spec/security review.

**Goal:** Run the current trbhh.sa presentation against current public production data, with all experimental edits isolated and no effects on production payments.

**Architecture:** Reuse the original server application presentation instead of recreating it in the static V2 shell. A dedicated runtime must use a database principal whose effective grants are SELECT-only, an independent authentication secret, independent cache and read-only media. A fail-closed route policy must deny mutations, authentication, private/admin/payment routes and production tasks. Experimental ad creation remains explicitly local to the preview browser, using the developed category-specific form. No production branch merge, restart or credential reuse in public assets.

**Tech Stack:** Existing Next.js/Prisma/MySQL application, Docker Compose, GitHub Actions SSH, Vitest and Playwright.

## 1. Verify infrastructure before provisioning

- [x] Run `scripts/preview/inspect-live-runtime.sh` through the existing preview workflow with `inspect_live=true`. Output only revision, service health, database endpoint/schema, privilege capability booleans and available resources. Never print secrets or rows.
- [x] Verify the deployed revision matches the source baseline; preserve local dropdown and location changes.
- [ ] Confirm availability of a privileged provisioning channel for a separate SELECT-only principal. If unavailable, report this exact access blocker; never run with writable production credentials.

## 2. Enforce runtime isolation

- [x] Unit tests first for a pure preview route policy: public GET/HEAD allowed; POST/PUT/PATCH/DELETE, auth, admin, wallet, scheduled tasks and internal APIs denied, including encoded paths.
- [x] Add an explicit environment-only preview mode. Default off; production behavior unchanged. Skip schema synchronization and scheduled/lifecycle writes. Force guest sessions, no production Redis, no outbound messaging or payment calls.
- [x] Test startup against a disposable SELECT-only MySQL principal; attempt a transactionally safe denied UPDATE with an impossible predicate and confirm rejection before connecting production.
- [ ] Independently review every public rendering path and grant assertion. Do not deploy while any write path, private route, shared secret or cache remains reachable.

## 3. Preserve original presentation and experimental form

- [ ] Reuse original header, navigation, cards, typography, settings and homepage layout by default; no new visual approximation.
- [ ] Render the existing specialized ad form within the original shell on the isolated runtime, retaining main-category dropdown and region-then-city selection. Local changes must never invoke production Server Actions.
- [ ] Label the guest preview and local-only saves clearly; block account/payment controls in preview rather than linking accidentally to production workflows.
- [ ] Test desktop/mobile, ad images, search, original IDs, all 56 category profiles, draft reload and locally saved ads.

## 4. Deployment and proof

- [ ] Create a separate named Docker project and guarded directory, backed up before updates. Never modify /root/trbhh configuration or volumes. Do not enable a publicly writable database port.
- [ ] Apply the principle of least privilege, fresh secrets, resource limits, read-only mounts and a restricted public proxy. Preserve an explicit rollback command for this project only.
- [ ] Run TypeScript, lint, tests and build before preview-only push. Require successful CI before deployment.
- [ ] Verify live reads with public IDs/timestamps matching trbhh.sa, prove all mutation requests are denied and the live principal has no write grants. Do not claim live linkage based on a successful build or old snapshot.
- [ ] Deliver the actual verified preview URL. Keep the existing static Site unchanged until the replacement is verified; never describe its snapshot as a live connection.

Approved by user: original design default, live public reads, experimental additions/edits isolated. Infrastructure provisioning is limited to this separate preview; no production UI/data/payment activation.

## Follow-up verification and scope update — 2026-09-19

- User explicitly deferred processing old advertisements in «أخرى» until after a future production migration. Do not reclassify them now or require an export of the user's browser assignments to continue unrelated work. This deferral is not authorization to deploy production.
- Confirmed GitHub runs 35431579832 (CI) and 35431579775 (TRBHH V2 preview) both completed successfully.
- Fresh targeted verification: 33 tests passed across the five root preview isolation, middleware, grant, media and local-seller suites; all 37 standalone preview tests passed.
- These checks cover category-dependent fields, job salary instead of sale price/condition, conditional and empty-field handling, configurable required/hidden fields, custom multiple choice, category dropdown, public snapshot boundaries and isolated local form dependencies. They do not establish a live database connection or deployment.
- The outstanding deployment gate below remains unresolved. No production ad classification, database credentials, payment behavior or public preview deployment was changed by this follow-up.

Provisioning blocked by verified missing administrative database channel (run 35431110401). Application account lacks CREATE USER/GRANT OPTION; host socket/defaults access is unavailable; bundled Docker database is a different server. User input requested to open the correct database management panel or have the hosting administrator create the restricted principal. No production credentials reused, no production writes, no replacement deployment performed.
