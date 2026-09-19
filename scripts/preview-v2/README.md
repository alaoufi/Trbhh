# Independent writable sandbox (Node 24)

This is NOT production and NOT a continuous live database connection. It uses a
dated, validated public snapshot, original downloaded photos, synthetic users,
and a separately named MySQL database. Existing ad classification is preserved
and deferred. No real-user credentials, contacts or payment configuration are
imported. The root application template is used; seeded settings are safe test
settings, not a full copy of production configuration.

## Deployment and recovery

Only manually dispatch `trbhh-v2-preview.yml` on `codex/trbhh-v2-preview` with
`sandbox_deploy=true`. Full exact-commit CI and browser gates must pass before SSH
deployment. The job uses existing SSH credentials and `TRBHH_PREVIEW_PASSWORD`
for users `preview` and `preview-store`; neither is an administrator. Credentials
stay in GitHub Secrets and private server files, never this repository.

`VPS_KNOWN_HOSTS` is mandatory. Its initial host key was accepted through a local
trust-on-first-use connection, not independently fingerprint-verified. Future
connections require that pin and fail on mismatch; never auto-refresh it.

The only remote target is `/root/trbhh-preview-v2`, guarded by `.preview-only`,
with Compose project `trbhh-preview-v2`. Releases use commit + run + attempt IDs.
MySQL, Redis and app are on an internal network with no outbound access; only
the Cloudflare tunnel has egress. Sandbox code additionally disables Redis.
No host ports, production volumes, database connection or payment secrets are
passed. The temporary tunnel URL may change when its container restarts.

Initial SQL is imported only into the empty new volume. Subsequent deployments
preserve database content and persistent public media; a fresh workflow snapshot
does not replace existing sandbox ads automatically. Before updating, configuration
and database backups are saved under `backups/`. An activation failure or handled
signal stops sandbox app/proxy/tunnel and restores prior configuration. It does
NOT restore the database or guarantee automatic service recovery. Review schema
compatibility before restarting a previous release; never apply these backups to
production. Older sandboxes without the persistent media mount need their old
assets copied into `public-media` before their first update.

## Test behavior and limits

Guests browse public imported ads. `/ads/new`, `/seller` and `/field-settings`
require a test login to save. Ads/drafts/field settings are persisted per account
in `preview_states`, with expected-owner checks, revision conflicts, same-origin
JSON requests and bounded bodies. Experimental ads appear in the personal seller
dashboard, not the public imported feed. Field settings are personal trial
settings, not production-wide category administration. All Next Server Actions
and non-allowlisted routes are blocked, including real payments and registration.

`tests/browser/preview-sandbox-runtime.mjs` accepts only loopback port 4192 and
refuses accounts with existing user data. It exercises real login/MySQL saves,
fresh-session recovery, original photos, field configuration and isolation, then
clears only the test state it owns. `preview-sandbox-storage.mjs` is a separate
mocked-API test for failure, account-switch and navigation races.

## Public media staging

From the repository root:

```sh
node scripts/preview-v2/prepare-public-media.mjs /absolute/validated/public-snapshot.json /absolute/build-staging/public-media
node --test preview-v2/tests/public-media.test.mjs
```

Use a dedicated staging directory controlled exclusively by this build. Do not run concurrent packers against it or allow another process to change its paths. The input is validated through `preview-v2/lib/snapshot.ts`. The CLI bounds input JSON to 32 MiB.

The importer contract is `output/manifest.json`: a JSON object mapping each exact source URL to `/snapshot-media/<sha256-of-URL>.<validated-extension>`. Files are in `output/snapshot-media/`. The original extension is retained when it matches the detected type; otherwise the extension is derived from the binary signature and matching HTTP MIME. Source URLs and downloaded bytes remain unchanged. Copy that directory into the sandbox's public root only after exit status zero; keep the manifest as a build intermediate. The packer performs no activation or deployment.

Every unique URL from every listing's `images` array is included. An empty array requires no media; no placeholders are generated. There is no separate video property in the validated snapshot. If an array contains a supported video URL, it is packed, not skipped. Supported source extensions are jpg/jpeg, png, gif, webp, avif, heic/heif, mp4 and webm. HTTP MIME and binary container signature must agree; a source filename mismatch alone is allowed. HEIC/HEIF originals are preserved without transcoding, so browser display support varies. This is format identification, not full decoder validation. Unsupported formats (including SVG) fail explicitly.

Only literal canonical `https://trbhh.sa/media/...` URLs are accepted, without credentials, ports, queries, fragments or traversal. Requests use GET, no cookies/authentication, and no redirects. Limits: four concurrent downloads, 30 seconds per request including body, 20 MiB per file, 10,000 unique URLs and 1 GiB aggregate bytes. Transient transport failures and HTTP 429/502/503/504 allow at most three attempts with short backoff; redirects and format/size failures are never retried. Originals are never resized or altered. Oversized originals fail; their real sizes are not assumed or pre-fetched.

Writes are exclusive and limited to generated media paths and the manifest. Existing identical bytes are accepted; conflicting files and symbolic-link paths fail. Reruns re-fetch and verify content. Nothing is deleted or overwritten. A failed run may leave partial staging files or a manifest from an earlier successful run; never activate staging based solely on manifest existence. Use a fresh staging directory for a changed snapshot. Only success counts/bytes/listing totals or a generic failure message are logged.
