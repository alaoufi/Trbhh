# Admin category help implementation plan

**Goal:** المساعدة المعتمدة: دليل الاستخدام، شرح متحرك، لقطات توضيحية لإدارة الأقسام.
**Architecture:** Reuse GuideView, TutorialPlayer and actual category controls. New staff-only help route, fixed safe links, editable captions in the existing settings store. No category/data/schema changes.
**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright.

- [ ] Add failing tests for help steps covering all six existing category pages, valid captions and escaped rendering.
- [ ] Implement shared help definition and staff-only `/admin/help` with link-based tabs, written instructions and reusable animated player starting paused.
- [ ] Render existing category components using synthetic fixtures; generate and label screenshots as training examples, not live account captures.
- [ ] Add navigation from admin and category pages; update admin/member/store guides. Expose caption/enable settings guarded by categories edit permission and read-only preview protection.
- [ ] Run targeted tests, typecheck, lint, browser checks at 390/1024; build once. Preserve safe Arabic commit. Deploy only through existing backup and release gates.

## Acceptance
Navigation must not mutate data. Reduced-motion users are not auto-played. Screenshots contain no member data. Existing guide link remains valid. Settings validation rejects incomplete/overlong captions and arbitrary keys. Production success is reported only after verified release.
