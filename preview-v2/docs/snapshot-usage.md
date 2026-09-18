# Public snapshot preview

Use Node 22.18+ (native TypeScript stripping). No production connection is made by the adapter or preparation script.

From `preview-v2`, set `TRBHH_SNAPSHOT_FILE` to an explicit local JSON file exported by the public-snapshot workflow, then run `npm run build`, `npm run dev`, or `npm run typecheck`. Each command prepares `lib/generated/snapshot.json`, which is ignored by Git. Without that environment variable, preparation resets to `{mode:'demo',listings:[]}` and the existing demo fixtures remain active. Invalid explicit input fails closed and removes the prior generated snapshot; it never silently falls back to demo.

```powershell
$env:TRBHH_SNAPSHOT_FILE='C:/private-artifacts/public-snapshot.json'
npm run typecheck
npm run build
```

Do not add production JSON to Git, including test fixtures. Build output contains the public snapshot; distribute that output only as the intended preview. Snapshot input requires exactly the documented public fields, complete metadata, unique positive decimal original IDs, a 40-character source commit and at most 10,000 records. Media allows HTTPS on trbhh.sa, trbhh.com, www.trbhh.sa or www.trbhh.com under `/media/`, without credentials, port, query or fragment. Missing photographs use a neutral placeholder. Required nullable `priceType` and `rentPeriod` preserve public price semantics: rental amounts include the original period; zero uses “على السوم”, “السعر قابل للتفاوض”, or unspecified price/budget as appropriate. Condition/specifications are never invented.

All original ad IDs feed the existing static detail route. Home is capped; search and classification show 48 rows per page while filtering/counting the entire snapshot. Wanted results use original `intent`, not demo requests. Seller/account/credit/message tools remain explicitly local simulations; live records do not seed seller-owned ads. Demo stores are hidden in live mode. Original links allow users to inspect the source separately. The header displays snapshot date and count; this is not real-time synchronization.

Classification review is stored only in browser localStorage. “Select all visible” selects the current page; switching pages/search clears selection. “تنزيل التصنيفات المراجعة JSON” exports all current manually reviewed market assignments across pages, with original ID, revision, source category IDs, destination labels and snapshot metadata. Automatic guesses, local ads, obsolete revisions and unreviewed entries are excluded. This download performs no migration or backend write; a separate controlled process must validate revisions and resolve destination labels before any future migration.

## Local tests without production requests

`npm test` runs validator/adapter and existing regressions. To run the browser snapshot test, prepare synthetic data:

```powershell
node tests/prepare-browser-snapshot.mjs
$env:TRBHH_SNAPSHOT_FILE='test-results/synthetic-snapshot.json'
npm run dev -- --port 4188
# In a second terminal with Playwright installed:
$env:PREVIEW_URL='http://127.0.0.1:4188'
node tests/browser-snapshot.mjs
```

The browser test blocks all non-local requests, exercises a 55-record synthetic snapshot, search, original detail IDs, page selection, and a downloaded 48-assignment JSON. `PLAYWRIGHT_MODULE` may point to the bundled Playwright package. Stop the dev server and remove `TRBHH_SNAPSHOT_FILE` before running the ordinary demo regression browser scripts. Avoid preparing a different snapshot while another build/dev process is using it.
