# تقرير إنجاز تكامل تربح مع CJdropshipping (الطبقة المالية)

**الفرع:** `claude/hostinger-vps-project-amw8vb` · **آخر commit:** `06d70e07`
**التاريخ:** 2026-10-09 · **الحالة:** الكود مكتمل ومُختبَر محليًا · البوابات المالية **معطّلة افتراضيًا**

---

## 1) ملخّص تنفيذي

اكتمل بناء دورة الشراء والدفع الكاملة مع CJ داخل تربح، مبنيّةً على ما كان موجودًا
(سعر/مخزون/شحن حيّ) دون تكرار، وفق وثائق CJ الرسمية الحالية (`api2.0/v1/shopping`).
**لا يحدث أي خصم حقيقي** قبل تفعيل يدوي من الإدارة لحارسَين معًا:
`commerce_purchasing_enabled` + `SUPPLIER_ALLOW_LIVE_ORDERS=true`.

كل الاستدعاءات المالية الحيّة تحتاج بيانات اعتماد CJ في قاعدة الإنتاج وتُنفَّذ على
الخادم — لذا التجربة الحيّة الفعلية تبقى خطوتك على الخادم، والكود جاهز لها بالكامل.

---

## 2) حالة المتطلبات الـ12

| # | المتطلب | الحالة | الدليل في الكود |
|---|---------|--------|------------------|
| 1 | اختيار منتج معروض بكل خياراته | ✅ | `orders/new` + `createRealCjTestOrder` |
| 2 | سعر ومخزون حيّان من CJ | ✅ (كان موجودًا) | `availability.ts` `verifyCjVariantForSaudi` |
| 3 | شحن حقيقي للسعودية | ✅ (كان موجودًا) | `client.ts` `calculateFreightToKSA` (SA) |
| 4 | عرض السعر+الشحن+الضريبة+الإجمالي مع وقت ومصدر التحقق | ✅ | `verified_at`/`verified_source` + لوحة الطلب |
| 5 | إعادة تحقق قبل الدفع + منع تجاوز السقف | ✅ | `payment.ts` + `cj_order_cap_usd` |
| 6 | رابط شحن محفظة CJ الرسمي داخل تربح | ✅ | لوحة الطلبات (`cj_wallet_topup_url`) |
| 7 | إنشاء الطلب وإرساله إلى CJ | ✅ | `createCjOrder` (payType=3) + `dispatch.ts` |
| 8 | الدفع تلقائيًا من محفظة CJ بعد موافقة الإدارة | ✅ | `payCjOrderBalance` + `approveAndPayOrder` |
| 9 | مراحل الطلب عبر Webhooks + استطلاع دوري | ✅ | `sync-status.ts` + `webhooks/route` + `poll-orders` |
| 10 | رسوم إضافية/تغيّر التكلفة/منع التكرار | ✅ | `internal_ref` + `payId` + `paid_at` + `entry_key` |
| 11 | دفتر محاسبة + مطابقة مع CJ | ✅ | `ledger.ts` (`cj_ledger`) + `getCjBalance` |
| 12 | تجربة شراء حقيقية للإدارة من منتج معروض | ✅ | `/admin/suppliers/cj/orders/new` |

---

## 3) التسلسل المالي الآمن (كيف يعمل الدفع)

1. **حارس التكرار:** لو `paid_at` موجود → لا يُعاد الخصم إطلاقًا.
2. **إنشاء الطلب لدى CJ بـ`payType=3`** (إنشاء بلا خصم) لمعرفة **المبلغ الفعلي**
   (`actualPayment`). لو وُجد `cj_order_id` سابقًا يُعاد استخدامه (منع ازدواج الطلب).
3. **منع الدفع بلا مبلغ متحقق:** غياب `actualPayment` يوقف العملية (حالة «يحتاج تدخّلاً»).
4. **السقف المعتمَد:** لو `actualPayment` تجاوز `cj_order_cap_usd` → يُمنع الخصم نهائيًا.
5. **الدفع** عبر `payBalance`/`payBalanceV2` مع `payId` ثابت مشتقّ من مرجعنا
   (منع ازدواج الخصم لدى CJ).
6. **عند النجاح:** تثبيت `paid` + ختم `paid_at`/المعتمِد + **قيد محاسبي واحد** (idempotent).

---

## 4) الملفات المضافة/المعدّلة

**جديدة:**
- `src/lib/cj/orders/payment.ts` — مُنسّق الاعتماد والدفع والسقف ومنع التكرار.
- `src/lib/cj/orders/ledger.ts` — دفتر محاسبة CJ (بالدولار) + المطابقة.
- `src/lib/cj/orders/sync-status.ts` — تطبيق حالة الـwebhook + الاستطلاع الدوري.
- `src/app/api/internal/cj/poll-orders/route.ts` — كرون شبكة الأمان.
- `src/app/admin/suppliers/cj/orders/new/page.tsx` — تجربة الشراء الحقيقية.
- `tests/unit/cj-sync-status.test.ts` — اختبار استخراج حالة webhook.

**معدّلة:**
- `src/lib/cj/client.ts` — `getCjBalance`/`payCjOrderBalance`/`getCjOrderDetail`/
  `confirmCjOrder` + `createCjOrder` (payType=3).
- `src/lib/cj/types.ts` · `src/lib/cj/orders/state.ts` (حالة `awaiting_approval`).
- `src/lib/cj/schema.ts` · `prisma/schema.prisma` — أعمدة الدفع + `cj_ledger` + أعمدة webhook.
- `src/app/admin/suppliers/cj/actions.ts` — `approveAndPayCjOrder`/`setCjOrderCap`/`createRealCjTestOrder`.
- `src/app/admin/suppliers/cj/orders/page.tsx` + `[id]/page.tsx` — لوحات الدفع/المحفظة/المطابقة.
- `src/app/api/integrations/cj/webhooks/route.ts` — تحليل الحالة وتطبيقها.
- `tests/integration/auth-upgrade.test.ts` — لقطة أعمدة القاعدة (إصلاح CI).

---

## 5) نقاط CJ الرسمية المستخدمة

- `POST /shopping/order/createOrderV2` (`payType=3` إنشاء بلا دفع)
- `POST /shopping/pay/payBalance` · `POST /shopping/pay/payBalanceV2` (`shipmentOrderId`+`payId`)
- `GET /shopping/pay/getBalance` · `GET /shopping/order/getOrderDetail`
- `PATCH /shopping/order/confirmOrder` · `GET /logistic/getTrackInfo`

---

## 6) إعدادات لوحة الإدارة الجديدة

- `cj_order_cap_usd` — سقف تكلفة الطلب الواحد (افتراضي 50$).
- `cj_wallet_topup_url` — رابط شحن محفظة CJ الرسمي (قابل للضبط).

---

## 7) خطوات التجربة الحيّة على الخادم (بعد النشر)

1. تأكّد من اعتماد CJ في قاعدة الإنتاج، وافحص الرصيد عبر «تحديث الرصيد».
2. فعّل مؤقتًا: `commerce_purchasing_enabled=1` و`SUPPLIER_ALLOW_LIVE_ORDERS=true`.
3. من «تجربة شراء حقيقية» اختر منتجًا معروضًا + عنوانًا → تحقّق حيّ + إنشاء طلب (بلا خصم).
4. في صفحة الطلب: اضبط سقفًا صغيرًا، ثم «اعتماد ودفع» → إنشاء لدى CJ + تحقق سقف + خصم.
5. راقب تحرّك الحالة (webhook/استطلاع) وتأكّد من قيد الدفتر والمطابقة مع الرصيد.
6. **وثّق النتائج والأخطاء وأبلغني** — لم يُعلَن النجاح لأن المراحل الحيّة تُنفَّذ على الخادم.
7. بعد التجربة، أعد الحارسَين إلى الإيقاف حتى إطلاق الشراء العام رسميًا.

---

## 8) بوابات الجودة

- `npx tsc --noEmit` ✅ · `pnpm lint` ✅ (0 أخطاء) · `pnpm build` ✅
- الاختبارات: **2391 ناجحة** · إصلاح فشلَي CI (اختبار التصيير + فحص ترقية القاعدة).
