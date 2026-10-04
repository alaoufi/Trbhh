# تصحيح الدليل إلى كتاب مجسّم

**Goal:** تنفيذ المقصود المعتمد: غلاف كتاب واضح ثلاثي الأبعاد، وليس إطار صفحة؛ فتح وإغلاق الكتاب، صفحات ملوّنة وتقليب ورقي، ولقطات داخل الشرح.
**Architecture:** تطوير GuideBook وCSS الحالية فقط. الحفاظ على المحتوى والفهرس والبحث والروابط والصلاحيات ومفتاح الرجوع. غلاف CSS perspective مع كعب وسُمك ورق؛ spread عند الفتح، صفحة واحدة على الجوال؛ reduced-motion يوقف الحركة. لا تبعيات أو بيانات جديدة.
**Tech Stack:** React, CSS transforms, Playwright, Vitest.

- [x] تعديل اختبار المتصفح: الغلاف ظاهر أولًا، فتح الكتاب يكشف المحتوى، إغلاقه وإعادة فتحه يحفظ الصفحة والبحث، الرابط المباشر يتجاوز الغلاف. تشغيله وإثبات فشله قبل التنفيذ.
- [x] إضافة opened state، jacket، شريط فتح/إغلاق، spread ملون وحركة ورقة واضحة بدل ميل 3 درجات؛ اللقطات التعليمية الحالية تبقى قابلة للتكبير.
- [x] توسيع اللقطات المرتبطة بفصول الإدارة فقط دون كشف بيانات أو صور إدارة في دليل العضو.
- [x] اختبار 390/1024/1440، فحص اللقطات بصريًا، TypeScript/lint/build، حفظ التعديل. عرض النتيجة الفعلية وعدم وصف أي نشر بأنه مكتمل قبل التحقق منه.

اعتماد التصميم قائم على طلب المستخدم الصريح لتصحيح التنفيذ السابق، مع إذنه السابق بالاستمرار دون تكرار طلب الموافقة على الخطوات الروتينية.

## أدلة الاختبار

- Application SHA: `98d5a97e2df885c9413e7adcae47c6636da66e44`.
- Targeted unit/render: 7 PASS. Browser: 390/1024/1440 PASS (open, close, preserve chapter, search, hash, history, dialog/Escape, reduced motion, overflow).
- Local build incl TypeScript PASS. Lint: 0 errors / 5 existing warnings. Independent review: no concrete regressions found.
- CI `37231541301` SUCCESS. Preview `37231542925` SUCCESS. External browser: member/store books PASS at 390/1440.
- Exact preview image `sha256:1236987bd1e259ad5e3ddd9bcf3517973fcc26f7d9f1bdf9bb722598ae0468ef` verified by inspect run `37231914942`.
- Backup `/root/trbhh-release-backups/final-37231989616`: BACKUP_FILES_VERIFIED; ISOLATED_READY matches SHA/image.
- Release `37232146536` SUCCESS: isolated job `111523965205` tested member/store/admin books and logged FINAL_ISOLATED_SMOKE_PASS. Production job `111525197588` logged FINAL_PRODUCTION_SMOKE_PASS and RELEASE_CONFIRMED at 2026-10-04 20:34:50 UTC with the exact SHA/image above. No rollback required.
- Post-release external anonymous Chrome check: `/guide` and `/guide/store` interactive cover/open/search/paging PASS at 390px; production screenshot saved locally under `artifacts/guide-book/production-cover-390.png`.
- Previous production application SHA `0b9369e72a58e52855d1e7a62b3e6baafcbbb255` preserved in rollback backup.
- No migrations, dependencies, taxonomy/search logic changes, or live supplier orders.
