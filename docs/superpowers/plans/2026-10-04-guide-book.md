# كتاب دليل الاستخدام — خطة التنفيذ المعتمدة

**Goal:** كتاب تفاعلي كحلي وذهبي لأدلة الإدارة والعضو والمتجر، بفهرس مصنف وبحث وصور وتنقل سريع.
**Architecture:** Keep guide content/server permission gates unchanged. Shared server GuideView chooses existing classic renderer or client GuideBook via existing settings framework. Transfer only serializable content, preserve all IDs/hash links and server-rendered text. No account/database migrations.
**Tech Stack:** Next.js/React, CSS modules, Vitest, Playwright.

- [x] Add tests for Arabic search, grouping, hash selection, server content preservation, classic fallback.
- [x] Implement pure `src/lib/guide-book.ts`, interactive `src/components/guide-book.tsx` and scoped CSS. One selected article after hydration, full readable SSR/no-JS content, desktop index/mobile collapsible index, previous/next, page number, optional reduced-motion-safe animation.
- [x] Reuse current guide content through `GuideView`; retain classic renderer and add `guide_book_enabled` to existing admin UX settings. Add relevant admin illustrations from existing synthetic captures and guide navigation links. Widen store guide container only.
- [ ] Verify browser behavior: 390/1024/1440, search/no results, hash links/history, keyboard controls, all three guide routes, reduced motion. Capture actual guide component screenshots with representative content, then review images.
- [ ] Run targeted tests/typecheck/lint/build; review diff, Arabic commit, CI and preview. Back up then deploy immutable tested image through existing release gate, verify external public guides and protected admin access.

## Boundaries
No new taxonomy/field schema/payment behavior. Existing textual chapters remain unchanged except a concise instruction for the new reader. Visual illustrations contain synthetic data only. Search is local to the guide, never queries member data. No cookies/localStorage for search or reading progress. Production claim requires confirmed release and smoke success.
