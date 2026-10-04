# Admin category help implementation plan

**Goal:** المساعدة المعتمدة: دليل الاستخدام، شرح متحرك، لقطات توضيحية لإدارة الأقسام.
**Architecture:** Reuse GuideView, TutorialPlayer and actual category controls. New staff-only help route, fixed safe links, editable captions in the existing settings store. No category/data/schema changes.
**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright.

- [x] Add tests for help steps covering all six existing category pages, valid captions and escaped rendering.
- [x] Implement shared help definition and staff-only `/admin/help` with link-based tabs, written instructions and reusable animated player starting paused.
- [x] Render existing category components using synthetic fixtures; generate and label screenshots as training examples, not live account captures.
- [x] Add navigation from admin and category pages; update admin/member/store guides. Expose caption/enable settings guarded by categories edit permission and read-only preview protection.
- [x] Run targeted tests, typecheck, lint, browser checks at 390/1024; build once. Preserve safe Arabic commit. Deploy only through existing backup and release gates.

## Acceptance
Navigation must not mutate data. Reduced-motion users are not auto-played. Screenshots contain no member data. Existing guide link remains valid. Settings validation rejects incomplete/overlong captions and arbitrary keys. Production success is reported only after verified release.

## Verified delivery

- App SHA: `eda132559919026c40640f30a83495c96c448d01`; preview and production use image `sha256:9f594c847d0772e5bb3345671b8ac0eb62be61c6334dec09deda14f83571667e`.
- 19 targeted tests PASS; TypeScript PASS; ESLint 0 errors (5 existing warnings); local build exit 0 (existing missing local DATABASE_URL warnings; real database checks run in isolated CI).
- CI `37199666366` SUCCESS; preview `37199671853` SUCCESS.
- Backup and isolated restore `37200177615` SUCCESS, retained at `/root/trbhh-release-backups/final-37200177615`.
- Release `37200318613` SUCCESS: help tab/play/pause/next/previous, six loaded images, member denied, 390/1024 all PASS; final isolated and production smoke PASS. No rollback needed.
- External production check: `/admin/help` sends the anonymous client to login via Next streamed redirect; no private tabs in its HTML. Six WebP assets HTTP 200 and byte hashes match tested files.
- Previous production app: `440076f2581b88a8a35eb60e03be9857c2fb20db`, retained rollback image/container. No migrations, no member data changes, no purchase enablement.
- Independent code review found no blocking issue. Images are synthetic examples rendered from real components, not screenshots of member accounts.
