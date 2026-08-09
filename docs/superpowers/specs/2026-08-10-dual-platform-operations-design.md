# Dual Platform Operations Design

## Goal

Run Trbhh and Agar Trbhh as independent applications on one VPS and one domain family, with repeatable validation, staging, backup, deployment, and rollback.

## Boundaries

| Platform | Production | Staging | Runtime identity |
| --- | --- | --- | --- |
| Trbhh | `trbhh.sa` | `staging.trbhh.sa` | `trbhh` |
| Agar Trbhh | `agar.trbhh.sa` | `staging.agar.trbhh.sa` | `agar-trbhh` |

The platforms must not share an application directory, database, Redis instance, upload directory, secret, Docker network, Docker project name, backup archive, or rollback reference. The reverse proxy and TLS certificate service are the only shared infrastructure.

## Architecture

Each platform has a source checkout, a production compose project, a staging compose project, a dedicated MySQL service, a dedicated Redis service, and a dedicated persistent media volume. Compose project names namespace containers, networks, and volumes. Environment files exist only on the VPS and are never committed.

The reverse proxy routes the four hostnames to their matching production or staging app service. Every deployment is initiated only after the candidate branch passes CI. Staging deploys use their own database and Redis and never connect to production credentials.

## Delivery Flow

1. A platform-specific feature branch runs dependency audit, typecheck, lint, unit tests, a disposable MySQL schema check, and a production build in CI.
2. The candidate is deployed to that platform's staging hostname.
3. Automated HTTP health checks and a manual smoke test verify staging.
4. A production backup captures the target platform's database, media, environment checksum, and deployed Git SHA.
5. The release is deployed only to the target platform; health checks must pass before the release is accepted.
6. Rollback resets only the target platform to the captured SHA and restores its matching backup when a database rollback is required.

## Backup and Rollback

Backups are platform-scoped and timestamped. A backup manifest records the platform name, Git SHA, database dump hash, media archive hash, and creation time. Retention keeps the most recent eight weekly backups plus the most recent fourteen daily backups per platform. Restore commands require an explicit platform argument and reject an unknown platform.

## Security and Safety

- CI has disposable credentials only.
- Production and staging secrets are separate and stored on the VPS or GitHub Secrets.
- Deploy workflows use a per-platform concurrency group.
- Production deployment cannot run from an arbitrary branch; only the approved production branch is eligible.
- Backup succeeds before deployment begins; a failed backup aborts the deploy.
- Each health check validates the expected hostname and rejects cross-platform routing.

## Verification

CI verifies build correctness. Platform smoke checks verify response status, security headers, host routing, and an authenticated administrative path using a staging-only account. Production post-deploy checks verify the expected hostname, release SHA endpoint or container image, and critical public pages without writing user data.

## Migration Constraint

The current repository is confirmed as the Trbhh source. No Agar production source is present in it. Agar receives its own runtime skeleton and operations configuration only after its authoritative source repository or deployment directory is identified; its data and code must not be inferred from Trbhh.
