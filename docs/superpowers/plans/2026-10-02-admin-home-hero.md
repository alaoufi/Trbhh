# Admin-selected homepage carousel

**Goal:** Only administrators choose and order the public advertisements in the homepage carousel.

**Architecture:** Reuse settings, the existing public advertisement visibility predicate and CommerceHero. Store up to ten ordered unique advertisement IDs in `home_hero_ad_ids`; an empty selection shows the existing platform introduction only. Never replace unavailable selections with unrelated advertisements. No migration or production data write.

**Tech Stack:** Next.js, server actions, React, Prisma, Vitest.

- [x] Add regression tests for empty selection, ordering, invalid/duplicate IDs, permission denial and unavailable advertisements.
- [x] Add a bounded public-card query using `activeAdWhere`, plus a strict selection parser.
- [x] Add a dedicated administrator form linked from settings: search recent eligible advertisements, enter an ID, add/remove/reorder selections, save independently of other settings. Authenticate on both read and save.
- [x] Read selections in the homepage, preserving the existing brand slide and seasonal presentation, without automatic feed fallback.
- [x] Update member/store/admin guides. Run focused tests, TypeScript, lint, build; commit and publish Preview only.
- [x] Verify public Preview and anonymous denial of admin access; report authenticated save tests separately from live read-only Preview.

Validation commands: `pnpm exec vitest run tests/unit/home-hero-selection.test.ts tests/unit/home-hero-action.test.ts tests/unit/home-category-page.test.ts tests/unit/public-home.test.ts`; `pnpm exec tsc --noEmit`; targeted ESLint; `pnpm build`.

## Results

- 38 targeted tests passed (including `favorite-public-visibility.test.ts`), TypeScript and targeted ESLint passed.
- Build exit 0; local prerender logged missing DATABASE_URL because no live credentials were loaded locally. Remote Preview build/deployment succeeded.
- Isolated real-browser picker test at 390/1440: selection, ordering, removal, empty selection and read-only save protection passed. Persistence mocked; action permission/validation tested separately. No real production selection saved.
- Preview application SHA: `6fb834ee3c730b9fa9acf31146f8e2244bc4425e`; workflow run `37058379571` succeeded.
- Anonymous external browser: homepage HTTP 200, no ad links inside unconfigured hero, 14 ad links still present elsewhere. Admin picker redirects to login with no picker exposed.
- Existing desktop CTA browser checks passed at 390/1024/1440.
- Production unchanged. Live read-only Preview permits inspecting/trying picker controls, not persistence.
