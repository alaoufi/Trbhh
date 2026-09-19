# Original design and isolated live preview implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent spec/security review.

**Goal:** Run the current trbhh.sa presentation against current public production data, with all experimental edits isolated and no effects on production payments.

**Architecture:** Reuse the original server application presentation instead of recreating it in the static V2 shell. A dedicated runtime must use a database principal whose effective grants are SELECT-only, an independent authentication secret, independent cache and read-only media. A fail-closed route policy must deny mutations, authentication, private/admin/payment routes and production tasks. Experimental ad creation remains explicitly local to the preview browser, using the developed category-specific form. No production branch merge, restart or credential reuse in public assets.

**Tech Stack:** Existing Next.js/Prisma/MySQL application, Docker Compose, GitHub Actions SSH, Vitest and Playwright.

## 1. Verify infrastructure before provisioning

- [ ] Run `scripts/preview/inspect-live-runtime.sh` through the existing preview workflow with `inspect_live=true`. Output only revision, service health, database endpoint/schema, privilege capability booleans and available resources. Never print secrets or rows.
- [ ] Verify the deployed revision matches the source baseline; preserve local dropdown and location changes.
- [ ] Confirm availability of a privileged provisioning channel for a separate SELECT-only principal. If unavailable, report this exact access blocker; never run with writable production credentials.

## 2. Enforce runtime isolation

- [ ] Unit tests first for a pure preview route policy: public GET/HEAD allowed; POST/PUT/PATCH/DELETE, auth, admin, wallet, scheduled tasks and internal APIs denied, including encoded paths.
- [ ] Add an explicit environment-only preview mode. Default off; production behavior unchanged. Skip schema synchronization and scheduled/lifecycle writes. Force guest sessions, no production Redis, no outbound messaging or payment calls.
- [ ] Test startup against a disposable SELECT-only MySQL principal; attempt a transactionally safe denied UPDATE with an impossible predicate and confirm rejection before connecting production.
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
