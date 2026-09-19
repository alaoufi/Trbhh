# Salla release preparation — review before any remote execution

Baseline: `eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96`. Branch: `codex/salla-release-20260920`.
Salla source `0050d1e` is cherry-picked onto the home release. No home source changes.

Use the already registered **release-safeguards.yml** workflow with the release branch as ref. Do not push the production branch just to register a workflow. The workflow has one parent `vps-deploy` concurrency group; its reusable child has no concurrency group. Configure/review GitHub environment `salla-release` approval protection before execution.

1. Review and commit the preparation changes locally, then main may authorize pushing the nonproduction branch. Every operation checks/builds the dispatched SHA, not a moving remote deployment branch.
2. Dispatch `phase=salla_prepare`. This performs a fresh full backup with isolated exact restore proof, including the existing bounded maintenance pause/watchdog. It requires the exact baseline and no reused media backup. It then transfers only the three Salla secrets over pinned SSH stdin and creates a new private `salla-staged.env` inside that backup. It does **not** replace live `.env` or restart the app. Use the run ID as `backup_id`.
3. Main reviews the verified backup and candidate. Dispatch `phase=salla_activate`, same ref/SHA, with that backup ID within one hour of verification. Candidate build finishes before stopping the old app. A 15-minute independent rollback timer protects the cutover. Additive supplier DDL and strict schema readiness run before the new app starts. The staged `.env` is atomically installed, with mode 600. The exact candidate image is force-recreated without rebuilding or pulling. HTTP checks, live-orders-off assertion, runtime environment/mount preservation and database/media preservation must pass before the timer is disarmed.
4. Failure after cutover invokes application-only rollback: backed-up image, resolved Compose and original environment. No live database restore/deletion occurs. A failed or rolled-back activation is not replayed with the same backup; inspect privately and prepare a new backup. The Git checkout may remain candidate after rollback: reconcile it deliberately before any later automatic deployment.

Manual recovery, only after operator review: dispatch `phase=salla_rollback` with the original candidate ref and backup ID, or run the backed-up tool `salla-rollback.sh BACKUP_ID CANDIDATE_SHA`. The shell rollback requires baseline-or-candidate HEAD and verifies the original image exists. It preserves failed config evidence in a unique private directory. Existing backups are never deleted/uploaded by these workflows.

Secrets: require `SALLA_CLIENT_ID`, `SALLA_CLIENT_SECRET`, `SALLA_WEBHOOK_SECRET`, plus existing VPS transport secrets and pinned `VPS_KNOWN_HOSTS`. Missing/unsafe secrets fail closed. Values with whitespace, quotes, dollar signs or newlines are deliberately rejected, not interpolated/escaped ambiguously. Existing raw 64-hex encryption/reconcile keys are retained; absent keys are generated once into the staged environment. Empty, duplicate, quoted or malformed persistent keys require explicit operator repair rather than silent replacement. No values are printed, published as artifacts or passed in process arguments. Only source-derived schema-check code is a CI artifact.

The environment/Compose exception permits exactly seven Salla variables; other raw environment lines, other Compose content, all unrelated effective runtime environment values, and mounts must remain unchanged. Normal safeguards behavior stays unchanged outside explicit `salla` profile.

Origin is forced to `https://trbhh.sa`; `SUPPLIER_ALLOW_LIVE_ORDERS=false`. Code still rejects real supplier-order creation even if toggled. No supplier profile is enabled and no merchant consent is fabricated. OAuth consent and test-merchant acceptance remain manual follow-up; this release is not proof of live purchasing. No CJ integration or changes to wallet/bank credentials are included.

Remote paths, GitHub environment approval and private backup availability must be reviewed by main. Local static/unit/build tests do not prove the SSH/cutover scripts have executed successfully on the VPS.
# Activation failure coordination

Activation now runs in a separate systemd control group with a 14-minute runtime limit and a 15-second forced-stop deadline. The independent 15-minute watchdog and immediate EXIT cleanup use the same coordinator lock. They mark cancellation, synchronously stop the activation unit, remove the named schema helper container, and only then restore the prior application/configuration. Explicit shell exits trigger cleanup. A completed rollback is marked to prevent duplicate restoration; a failed stop cannot be recorded as successful rollback. The live database is never restored by this application-only rollback.

Launch and success finalization also hold the coordinator lock. Success stops only the watchdog timer; it never kills an already-running rollback service. A queued watchdog observes the success marker under the same lock. Cutover checks cancellation between mutation stages.

`tests/unit/salla-coordination.test.ts` executes real Bash failures and delayed-process cancellation with mocked systemctl/Docker commands. Linux CI additionally exercises real `flock` with simultaneous rollback callers before backup jobs. This is not a real systemd/Docker integration test; Windows skips only the Linux flock case. Merchant OAuth/purchase E2E remains unverified.
