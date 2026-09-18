# Real public ads preview implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded UI task and review. No production deployment or mutations.

**Goal:** Populate the existing isolated V2 preview with a dated, read-only snapshot of public production ads and original photo URLs.

**Architecture:** A manually dispatched preview-only Actions job runs a SELECT-only exporter in the existing production app container. A single-connection Prisma client sets the session read-only before a consistent transaction. Explicit field projection excludes account credentials, contact columns, conversations and finance. Snapshot JSON is downloaded as a short-lived artifact, not committed to the public GitHub repository. Static preview builds consume the ignored generated snapshot; classification remains browser-local, keyed to source IDs and revisions.

**Tech Stack:** Next static export, Node, Prisma/MySQL, GitHub Actions SSH, native Sites hosting.

## Tasks

- [ ] Export contract/tests: `preview-v2/scripts/export-public-snapshot.cjs`, `preview-v2/tests/live-snapshot.test.mjs`. Verify URL allowlist, explicit projection and privacy rejection before implementing. SELECT public active, non-banned, non-paused, non-archived, eligible lifecycle/package ads. Read photos by selected ad IDs only; no app helper imports, writes, DDL or service restart. Abort on unexpected schema or >10,000 ads, never silently truncate.
- [ ] Add manually gated `workflow_dispatch` snapshot job to `.github/workflows/trbhh-v2-preview.yml`, restricted to `codex/trbhh-v2-preview`, after tests/build. Pipe exporter over SSH; do not print payload or credentials. Upload only validated public JSON, retention one day.
- [ ] UI adapter: `preview-v2/lib/demo-data.ts`, ignored generated JSON, preparation script and consuming UI. Default fixture tests remain possible. Real mode replaces marketplace fixtures, preserves IDs/photos/title/description/price, labels snapshot date, keeps account/store simulation clearly marked. Full original-ad links, conservative classification, no guessed condition/specifications. Bound rendered search/table pages. Export reviewed classification mapping with original ID/revision for later controlled activation, never write it to production.
- [ ] Run unit/type/build gates, independently review exporter before dispatch. Fetch/compare preview origin before Arabic commit, push preview only. Dispatch and download snapshot, verify allowlisted keys/count/completeness and representative original image responses.
- [ ] Build with actual snapshot, browser-test home/search/detail/gallery/classification/mobile and no production writes. Review spec then code quality. Publish the same public Sites preview; keep source SHA, snapshot hash/time/count and previous deploy for rollback.
- [ ] Document refresh/activation gates: refresh snapshot on demand; separately approved integration/migration, backup/restore and card-payment regression required before production. Never describe static preview as a live writable deployment.

## Test commands

```powershell
node --test tests/live-snapshot.test.mjs
npm test
npm run build
npm run typecheck
git diff --check
```

Expected: sanitizer tests fail before exporter implementation then pass; full fixture suite remains green. Actual snapshot must have unique IDs, count equal to array length, valid ISO time, original HTTPS media links only, and no forbidden top-level/private columns. Review exported metadata before publication. Real-data browser QA must show count matching the snapshot, working details/photos, local-only bulk changes and undo, and no mutation requests to the production origin.

## Execution evidence

Exporter/schema mapping and frontend spec/quality gates reviewed. Successful extraction run `35405115631`: 120 eligible ads, 685 image references, one future-scheduled candidate excluded without source modification. SHA-256 and refresh/activation details are in `docs/trbhh-v2/07-public-snapshot-preview.md`. Thirty-five unit tests, static live build and TypeScript passed. Real-data browser tests passed for all generated original-ID route files and sampled rendered galleries, local review export/undo and mobile. Publication remains the final handoff step; no production merge or DB write is part of this plan.
