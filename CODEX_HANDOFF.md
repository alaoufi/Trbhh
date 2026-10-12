# CODEX_HANDOFF — تسليم مشروع تربح (Trbhh) من Claude إلى Codex

تاريخ: 2026-10-12 · هذه وثيقة تسليم فقط — لا تطوير ميزات جديدة قبل حسم المتطلبات مع Lumi.

> تفاصيل أوسع في `docs/CODEX_HANDOFF_2026-10-12.md`. هذا الملف هو نقطة البداية المختصرة.

---

## 1) النسخة المعتمدة (متحقَّق منها على GitHub)

| العنصر | القيمة |
|---|---|
| المستودع | `alaoufi/trbhh` → https://github.com/alaoufi/Trbhh |
| الفرع المعتمد | `claude/hostinger-vps-project-amw8vb` |
| رابط الفرع | https://github.com/alaoufi/Trbhh/tree/claude/hostinger-vps-project-amw8vb |
| آخر Commit كود المشروع | `c37790f2e08d0907cd5c2ff2d091e698a2e2c65e` |
| Commit وثيقة التسليم (الأولى) | `2ef22f331d470925d7c15f843a8dfa1aa3756196` |
| فرع النسخة الاحتياطية | `backup/claude-handoff-20261012` |
| حالة GitHub | ✅ الفرعان مرفوعان ومتحقَّق منهما عبر `git ls-remote` |
| شجرة العمل | نظيفة — لا تعديلات محلية غير مرفوعة |

تحذير: **لا تكتب فوق** `backup/claude-handoff-20261012` ولا تدفع إليه. هو نسخة تجميد مرجعية.

---

## 2) من أين يبدأ Codex

```bash
git clone https://github.com/alaoufi/Trbhh.git && cd Trbhh
git fetch origin
# تحقّق من مطابقة النسخة المعتمدة:
git rev-parse origin/claude/hostinger-vps-project-amw8vb   # يجب أن يبدأ بـ 2ef22f33
# افتح فرع عمل جديد من النسخة المعتمدة (دون المساس بفرع الحماية):
git checkout -b codex/work-20261012 origin/claude/hostinger-vps-project-amw8vb
```

اقرأ قبل تعديل أي ملف: هذا الملف، ثم `docs/CODEX_HANDOFF_2026-10-12.md`، ثم `CLAUDE.md`
و`دليل-المطور.md` (قواعد المشروع الثابتة: رسائل commit بالعربية، أي ميزة قابلة للتحكم من
لوحة الإدارة، المخطط المتسامح في `src/data/schema-sync.ts` + `prisma/schema.prisma`).

## 3) تشغيل المشروع واختباره

```bash
corepack enable && pnpm install --frozen-lockfile
# بوابات الجودة قبل أي دفع (كلها يجب أن تنجح):
npx tsc --noEmit
pnpm lint            # eslint .  (0 errors؛ التحذيرات القديمة مقبولة)
pnpm build           # next build
pnpm test            # vitest run  (المجموعة الكاملة)
pnpm dev             # next dev — تطوير محلي
```

النشر على الخادم (Hostinger VPS، `/root/trbhh`): `bash scripts/deploy.sh` (يخبز الـcommit
في `TRBHH_RELEASE_COMMIT` فيظهر رقم النسخة في التذييل). النشر تلقائي أيضاً عبر
`.github/workflows/deploy.yml` عند الدفع للفرع بعد نجاح CI. **لا تنشر إنتاجاً ولا تفعّل شراءً
حقيقياً إلا بعد التحقق والموافقة.**

---

## 4) الأعمال المتبقية (بالترتيب) ومساراتها

1. **تأكيد يدوي حيّ لإصلاح ثبات شحن سلة CJ** (commit `c37790f2`) على trbhh.sa:
   غيّر الكمية ١←٢←١ وتأكّد أن الإجمالي يرجع للأصل ويبقى ثابتاً، وأن رسالة «مسار الشحن
   المعتمد غير متاح لهذه الكمية» تظهر عند تبديل CJ للمسار.
   - الملف: `src/components/cj/trial-cart.tsx`
   - المنطق المرتبط: `src/lib/cj/trial-quote.ts`، `src/lib/cj/availability.ts`،
     `src/app/api/cj/products/[id]/verify-variant/route.ts`، `src/lib/cj/trial-cart.ts`
2. **تشغيل `pnpm test` الكاملة** والتأكد من عدم انحدار شيء خارج مجموعة السلة
   (شُغّلت مجموعة السلة المستهدفة فقط عند التسليم: 94/94). اختبارات متذبذبة معروفة:
   `tests/unit/search-card-visibility-fixture*`، `tests/unit/supplier-integration-schema*`
   (تنجح منفردة).
3. **مراجعة سلوك تبديل الكمية** عند اختفاء المسار المعتمد: القرار الحالي «إلغاء التغيير +
   رسالة». أي بديل (عرض مسارات بديلة للاختيار) = عمل جديد يحتاج موافقة.
4. تحسينات UI متبقية على صفحة سلعة CJ/السلة حسب ملاحظات المالك.

> لا تبدأ تكاملات CJ جديدة ولا تعديلات جوهرية على الأسعار/الشحن/المخزون قبل حسم المتطلبات
> مع Lumi. مشروع العقار غير مفعّل وخارج النطاق. حافظ على التصميم العربي RTL وهوية الموقع.

---

## 5) خريطة الكود السريعة (تكامل CJ والعناوين)

- السعر/المخزون/الشحن الحيّ: `src/lib/cj/availability.ts` (`verifyCjVariantForSaudi`).
  الشحن من `calculateFreightToKSA` ولا يُضرب في الكمية؛ CJ قد يعيد مساراً مختلفاً لكل كمية.
- تسعير السلة المعتمد: `src/lib/cj/trial-quote.ts` (`quoteCjTrialCart`) — تحقّق حيّ يرفض عند
  اختلاف السعر/المخزون/الشحن/الضريبة عن اللقطة؛ الإجمالي من `totalMinor` لكل سطر كما يعيده CJ.
- أنواع/أدوات السلة: `src/lib/cj/trial-cart.ts`.
- قوائم القسم الرئيسي/الفرعي: `src/components/cj/category-ref-picker.tsx`.
- العناوين: `src/lib/commerce/addresses.ts` (العنوان الوطني `^[A-Z]{4}\d{4}$`)،
  `src/components/account/address-entry-form.tsx` (قوائم منطقة/مدينة + خريطة).
- المحفظة/الطلبات/المحاسبة (مكتملة سابقاً): انظر `src/lib/wallet.ts` وطبقة دفع CJ.

ملاحظة ثابتة: ميزة «الأقسام» للعضو مُزالة نهائياً (قرار دائم)؛ التصنيف الآلي حبر داخلي فقط.
البذر لا يتم داخل الإقلاع (سبّب انقطاعاً سابقاً) — عبر سكربت SSH فقط.

---

## 6) الاختبارات التي جرت فعلاً عند `c37790f2`

- `npx tsc --noEmit` ✅ · `pnpm lint` ✅ (0 errors) · `pnpm build` ✅
- اختبارات السلة (`cj-trial-cart-ui/cj-trial-cart/cj-trial-quote/cj-trial-cart-api`): ✅ 94/94
- `pnpm test` الكاملة: **لم تُشغَّل** عند هذا الـcommit. التأكيد اليدوي الحيّ للإصلاح: **لم يتم بعد**.

لا تُعتبر أي ميزة «ناجحة على الإنتاج» قبل اختبارها فعلياً.

---

## 7) النسخة الاحتياطية

`backup/claude-handoff-20261012` محفوظة على GitHub عند نفس نقطة التسليم — لم تتغير ولا يُكتب
فوقها. استخدمها للرجوع المرجعي عند الحاجة فقط.
