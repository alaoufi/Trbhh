# كتاب دليل الاستخدام — خطة التنفيذ المعتمدة

**Goal:** كتاب تفاعلي كحلي وذهبي لأدلة الإدارة والعضو والمتجر، بفهرس مصنف وبحث وصور وتنقل سريع.
**Architecture:** Keep guide content/server permission gates unchanged. Shared server GuideView chooses existing classic renderer or client GuideBook via existing settings framework. Transfer only serializable content, preserve all IDs/hash links and server-rendered text. No account/database migrations.
**Tech Stack:** Next.js/React, CSS modules, Vitest, Playwright.

- [x] Add tests for Arabic search, grouping, hash selection, server content preservation, classic fallback.
- [x] Implement pure `src/lib/guide-book.ts`, interactive `src/components/guide-book.tsx` and scoped CSS. One selected article after hydration, full readable SSR/no-JS content, desktop index/mobile collapsible index, previous/next, page number, optional reduced-motion-safe animation.
- [x] Reuse current guide content through `GuideView`; retain classic renderer and add `guide_book_enabled` to existing admin UX settings. Add relevant admin illustrations from existing synthetic captures and guide navigation links. Widen store guide container only.
- [x] Verify component browser behavior: 390/1024/1440, search/no results, hash links/history, image dialog/Escape, reduced motion. Capture and inspect actual component screenshots with representative synthetic content. Deployed public guide routes verified externally at 390/1440; authenticated admin route is included in isolated release smoke.
- [x] Run targeted tests/typecheck/lint/build; review diff, Arabic commit, CI and preview. Back up then deploy immutable tested image through existing release gate, verify external public guides and protected admin access.

## Boundaries
No new taxonomy/field schema/payment behavior. Existing textual chapters remain unchanged except a concise instruction for the new reader. Visual illustrations contain synthetic data only. Search is local to the guide, never queries member data. No cookies/localStorage for search or reading progress. Production claim requires confirmed release and smoke success.

## Verification evidence

- Application SHA: `0b9369e72a58e52855d1e7a62b3e6baafcbbb255`.
- Immutable preview image: `sha256:70b4f4acce7adb7473997f8e9c71def6092fc4813cb6610059ece2e4be3e2788`.
- Seven targeted unit/render tests PASS. Browser fixture checks PASS at 390/1024/1440.
- Local typecheck/build PASS; lint: zero errors, five pre-existing warnings. Local build emits missing-DATABASE_URL warnings during static generation; connected CI build is authoritative for database-backed verification.
- Local full run: 1794 passed, 9 skipped, four five-second timeouts under concurrent build load. All 144 tests in those four files passed on serial-worker rerun, without code changes.
- CI `37222862201` SUCCESS, including connected build, isolated integration tests and browser tests.
- Preview deployment `37222870869` SUCCESS. External anonymous GET `/guide` and `/guide/store`: HTTP 200, book SSR present, 33 and 25 chapters. Actual browser interaction tests on both routes passed at 390/1440.
- Backup preparation `37223356693` SUCCESS: BACKUP_FILES_VERIFIED; isolated app SHA/image equal preview. Backup path `/root/trbhh-release-backups/final-37223356693`.
- Release run `37223546162` SUCCESS: isolated job `111498479136` logged interactive PASS for `/guide`, `/guide/store`, `/admin/guide`, then FINAL_ISOLATED_SMOKE_PASS. Production job `111499740446` logged public guide interaction PASS, FINAL_PRODUCTION_SMOKE_PASS, and RELEASE_CONFIRMED at 2026-10-04 18:20:35 UTC with the same application SHA and image. No rollback required.
- Post-release external anonymous GET: `/guide` and `/guide/store` HTTP 200, book present with 33/25 server-rendered chapters. `/admin/guide` exposes no book/chapters to anonymous users and streams the existing login redirect (HTTP 200 document with NEXT_REDIRECT; actual access remains protected).
- Production previous application SHA `eda132559919026c40640f30a83495c96c448d01`; rollback image `sha256:9f594c847d0772e5bb3345671b8ac0eb62be61c6334dec09deda14f83571667e` preserved by release gate.
- No migrations, schema modifications, new dependencies, member data edits, or live supplier orders.
