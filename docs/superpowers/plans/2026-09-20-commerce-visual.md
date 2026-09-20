# Commerce visual platform implementation plan

> For agentic workers: use subagent-driven-development; write failing behavioral tests before implementation and review each delivery.

**Goal:** Implement the approved Arabic visual commerce/catalog design on an isolated branch without deployment.

**Architecture:** Extend current commerce, ads and supplier storage, never replace them. Keep source catalog separate from manually approved commerce snapshots. A shared eligibility policy must control rendering and server checkout. Home sections/campaigns are database-driven with no empty wrappers.

**Stack:** Existing Next.js/React/TypeScript, Prisma/MySQL, Tailwind, Vitest.

## Safety and baseline
- [x] Branch `codex/commerce-visual-20260920` from production `8e3b173`; remove production upstream. No push/deploy/merge.
- [x] Baseline: 829 tests passed, 9 skipped using direct local Vitest (pnpm launcher attempted dependency reinstall).
- [ ] Only additive DDL mirrored in Prisma and schema-sync. Preview DB must be disposable loopback, never production.
- [ ] No edits to OAuth, Callback, Webhook, tokens, payments or live data. Live supplier orders remain false.

## 1. Domain and storage
- [ ] Add commerce presentation details, seller policies, home sections, campaigns, aggregated event metrics; retain existing IDs and orders. New offers default draft/hidden/inactive.
- [ ] Test all four types, switches, expiry, suspension and no-checkout member offers; then implement a shared fail-closed eligibility policy and server checkout integration.
- [ ] Test idempotent selected source import, full snapshot preservation, hidden drafts, and variant sale rejection; implement transaction with source mapping uniqueness, no overwrite of approved prices.

## 2. Management
- [ ] Add RBAC-protected unified commerce management, independent seller controls, type switches, product status and campaign CRUD/archive/duplicate/upload/preview.
- [ ] Extend supplier catalog UI with bounded server pagination/filtering and selected import. Preserve connection controls; render all source data safely, no raw HTML.
- [ ] Source price is not supplier negotiated cost. Margin warnings must use known cost and label source comparisons distinctly.

## 3. Public visual design
- [ ] Implement data-driven navy/gold RTL home composition under an admin-controlled feature switch, leaving legacy rendering as fallback/rollback.
- [ ] Test layout counts 0/1/2/3/4/6/20, campaign dates and automatic placement. Implement bounded sections, varied cards, hero swipe/autoplay/pause/reduced-motion, lazy media with fallback and fixed dimensions.
- [ ] Rank eligible items using available signals only; unknown metrics do not become fabricated ratings. Respect pins, expiry, exclusions and stock.
- [ ] Track genuine view/click/contact events with validated identifiers, deduplication and bounded retention; display unavailable conversions honestly.

## 4. Verification and delivery
- [ ] Unit tests, MySQL integration if local runtime available, Prisma generate, typecheck, lint, build.
- [ ] Local isolated preview with clearly marked fixture data (not claim Salla test-store connection), desktop/mobile screenshots and media-failure/empty-layout checks.
- [ ] Review spec compliance then code quality; fix regressions.
- [ ] Update member/store/admin guides and release notes with migration/rollback/test limits.
- [ ] Report exact screenshots/files/tests and incomplete external Salla test-store consent if unavailable. No production merge until explicit approval.

## Rollback and risks
Disable the new presentation feature to restore legacy home; revert candidate code without dropping additive tables. Production deployment requires its own backup and approval. Principal risks: accidental member checkout, stale supplier pricing, source import races, injected media/links, analytics inflation, broad catalog queries and preview accidentally pointing to production. Test these boundaries explicitly.

## التقدّم — الطبقة البصرية (2026-09-20)
منجز في هذه الدفعة (بلا مساس بـOAuth/Callback/Webhook، وبلا دمج/نشر، وliveOrders=false):
- [x] محرّك تخطيط ديناميكي نقيّ `src/lib/commerce/home-layout.ts`: إخفاء الأقسام الفارغة (٠) كليّاً، وتخطيط تلقائي حسب العدد (١ مميّز / ٢/٣/٤ / ٦ / ٧+ مقصوص بحدّ ٢٠)، وفواصل وخانات إعلان ديناميكية. اختبارات `tests/unit/home-layout.test.ts` تغطّي ٠/١/٢/٣/٤/٦/٢٠ والإسقاط والقصّ والإعلانات (١٤ اختباراً).
- [x] ثيم كحلي/ذهبي معزول `.commerce-scope` + كتالوج بصري `src/components/commerce/catalog.tsx` (بطاقات، صور كسولة بأبعاد ثابتة وبديل، سعر بالهللة→ر.س، شارات مميّز/نفاد، نصّ صِرف بلا HTML خام).
- [x] Hero متحرّك `src/components/commerce/commerce-hero.tsx`: تشغيل تلقائي + سحب + إيقاف عند المرور/التركيز/إخفاء التبويب + احترام prefers-reduced-motion + صور كسولة.
- [x] تركيب رئيسية ديناميكي `src/components/commerce/commerce-home.tsx`، ورُبط بـ`/shop` مع الحفاظ الكامل على منطق backend (getCommerceConfig / assertCommerceSchemaReady / نفس الاستعلام المعتمد / بوّابة الدفع / canCheckout). الكتالوج محكوم ببوّابة `config.enabled` الإدارية.
- [x] لقطات كمبيوتر/جوال ببيانات تجريبية معلّمة بوضوح: `docs/screenshots/commerce/commerce-desktop.png` و`commerce-mobile.png` (المصدر `commerce-preview.html`).

حدود لم تُنفَّذ (خارج الطبقة البصرية): جداول الأقسام/الحملات في القاعدة، ترتيب بإشارات حقيقية، تتبّع أحداث المشاهدة/النقر، ومعاينة تكامل MySQL حيّة (اللقطات من معاينة معزولة بلا قاعدة). البناء ✓ · lint ✓ (٠ أخطاء) · الاختبارات ٨٩٣ ناجحة/٨ متجاوزة.
