# TRBHH V2 — interactive review

Isolated, Arabic RTL marketplace preview. Uses fixture data and local browser storage only. No connection to the live Trbhh database, authentication, messaging or payment services.

## Run

```sh
cd preview-v2
npm ci
npm run dev
```

Open http://127.0.0.1:4186. Run `npm run typecheck` and `npm run build` before publishing. The build exports static files to `out/`.

## Review routes

- `/`: homepage, categories, offers, featured examples, wanted requests and stores.
- `/search/`: keyword/city/category/price/condition filters, offer/wanted and sorting.
- `/ads/101/` through `/ads/108/`: illustrative listing details.
- `/ads/new/`: single-page form with four visible sections (classification, specialized details, photos, live preview/publish), in-page navigation, linked validation summary and backward-compatible local drafts.
- `/field-settings/`: local-only field editor (labels, options, required/hidden, archive, custom fields and branch visibility). Public demo, not a production admin surface.
- `/guide/`, `/guide/store/`, `/admin/guide/`: field and draft guides for members, stores and preview administration.
- `/store/dar/`, `/store/tech/`, `/store/equipment/`: store profiles and catalog.
- `/seller/`: local listing management, pause/reactivate/edit and promotion preview.
- `/messages/`, `/account/`, `/account/credit/`: supporting preview flows.

Favorites, followed stores, drafts and seller edits are stored only in the current browser with the `trbhh-v2-` prefix. New test listings appear in the seller dashboard; they are not public market listings. Message submissions stay in the current page state. Payment and external contact buttons explain the intended journey without charging or contacting anyone.

Plans, promotion prices and periods are intentionally undecided. This is not a production-ready replacement; migration and release gates are in `../docs/trbhh-v2/`.

## Deployment boundaries

Branch: `codex/trbhh-v2-preview`. Deploy this directory alone to the new Vercel project `trbhh-v2-preview`, target **preview**. Do not import production environment variables, attach trbhh.sa, merge the production branch, or run database commands.

Production application source is untouched. Root TypeScript/ESLint exclude this independent directory so its aliases and dependencies do not leak into legacy application checks. A separate CI workflow checks this app.

Product images are illustrative and sourced in `public/images/SOURCES.md`. The approved logo is preserved in `public/logo.jpg`.

## Subcategory fields

The schema in `lib/category-fields.ts` covers 56 leaves with conditional fields, typed validation and domain-specific pricing/condition policies. The study and primary reference links are in `docs/subcategory-field-study-ar.md`.

Run `npm test`, `npm run typecheck` and `npm run build` before publishing. Browser regression is `node tests/browser-fields.mjs` against localhost; install Playwright or set `PLAYWRIGHT_MODULE` to an existing package path. `PREVIEW_URL`, `BROWSER_CHANNEL`, and `QA_OUTPUT` are optional. Browser tests never point to a live site. CI uses Node 24 for native TypeScript test imports.

The public design review export is hosted separately through Sites; the Vercel preview and the live Trbhh application are not changed by that static publication.

Single-page regression: `node tests/browser-one-page.mjs` (default local exported page at port 4187; `PREVIEW_URL` accepts a full local page URL). Covers old step-based draft restoration, all sections visible, no Next/Previous buttons, error-summary focus and mobile width. Use the same `PLAYWRIGHT_MODULE` setting as the field regression.
