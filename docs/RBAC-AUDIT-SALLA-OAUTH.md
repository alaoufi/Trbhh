# توثيق: صلاحيات الإدارة (RBAC) · سجل التدقيق · تكامل Salla OAuth

مرجع تشغيلي دقيق مبني على الكود المطبّق فعليًا (فرع `claude/hostinger-vps-project-amw8vb`،
المنشور على https://trbhh.sa). كل الادّعاءات أدناه مربوطة بملفاتها.

---

## 1) صلاحيات الإدارة و RBAC (نموذج الأقسام والأدوار)

مصدر واحد للحقيقة، والتحقّق **على الخادم** في كل صفحة وإجراء — لا إخفاء واجهة فقط.

- **السجل الثابت (كتالوج):** `src/lib/access-control/catalog.ts`
  - **الأقسام** `DEPARTMENTS` (١٠): الإدارة العليا، المحاسبة والمالية، الضرائب، الموردون
    والمنتجات، الطلبات والمبيعات، الشحن، المتاجر والتكاملات، خدمة العملاء، **التدقيق
    والمراجعة**، إدارة النظام التقنية.
  - **الوحدات** `MODULES` وكل وحدة وإجراءاتها (`view/create/edit/delete/approve/export/
    refund/reconcile/close_period/…`). مفتاح الصلاحية = `module:action` (مثل `audit:view`،
    `finance:view`، `integrations:authorize`).
  - **الصلاحيات الحساسة** `SENSITIVE_KEYS`: (مرتجع/إقفال فترة/اعتماد مالي/تصدير مالي/حذف
    مالي/إعدادات حساسة…) تُمنح **صراحةً** ولا تأتي ضمنًا مع «العرض».
  - `pagePermission(path)` يربط كل صفحة إدارة بمفتاح الصلاحية اللازم، و`canAccessPage`
    تُستخدم لتصفية القوائم.
- **الحُرّاس:** `src/lib/access-control/guards.ts`
  - `requireAccess(module, action)` و`requireAdminPage(path)` → إعادة توجيه إلى
    `/account?access=denied` عند نقص الصلاحية (خادميًا).
  - `hasAccess(uid, module, action)` و`readActorAccess(uid)` (كاش لكل طلب، لا يُخزَّن في
    التوكن).
- **التخزين والمنح:** `src/lib/access-control/store.ts`
  - الصلاحيات الفعلية تُقرأ من `access_user_roles → access_roles(active) → access_departments(active)
    → access_role_permissions` (لا رجوع إلى `is_admin` أو أدوار قديمة).
  - أي تعديل (`mutate`) يشترط أن يكون المنفّذ يملك `access_control:manage_settings`، ويمنع
    **تصعيد الذات** (`noSelfEscalation`)، ويضمن **بقاء مدير واحد على الأقل** (`managersRemain`)،
    ويشترط ربط التحقق الثنائي إن كانت السياسة مفعّلة (`requireMfa`)، ويُسجّل كل تغيير في
    `access_audit` بسبب إلزامي.
- **التوافق القديم:** `src/lib/roles.ts` — `requireAction/hasAction/requireAnyAdmin/hasAnyAdmin/
  isManager` أُعيد بناؤها فوق النموذج الجديد (تقرأ `readActorAccess`)، فلا مسار جانبي.
- **بوابة لوحة الإدارة:** `src/app/admin/layout.tsx` — `requireAnyAdmin()` للدخول، ثم كل صفحة
  تفرض `requireAdminPage(path)` الخاص بها، والقوائم تُصفّى بـ `canAccessPage`.
- **الواجهة:** `/admin/access-control` (`access_control:view` للعرض، و`access_control:manage_settings`
  للتعديل) لإنشاء الأقسام والأدوار وإسناد الأدوار للموظفين.
- **الاختبارات:** `tests/unit/access-*.test.ts`، `tests/unit/roles.test.ts`،
  ومجموعة التكامل `tests/integration/access-control-mysql.test.ts` (على MySQL في CI).

---

## 2) سجل التدقيق وحجب المبالغ الحسّاسة

- **الصفحة:** `src/app/admin/audit/page.tsx`
  - الدخول يتطلب **`audit:view`** خادميًا (`requireAdminPage('/admin/audit')`).
  - تفاصيل المبالغ تظهر فقط لمن يملك صلاحية مالية/تدقيق مالي:
    `canSeeFinancial = hasAccess('finance','view') || hasAccess('reconciliation','view')`،
    ويُمرَّر `redactFinancial: !canSeeFinancial`.
- **الحجب:** `src/lib/audit.ts`
  - `isFinancialAudit(action, note, target)` يكشف السطور المالية (رصيد/شحن/تسوية/استرداد/
    مصروف/عمولة/مدفوعات/بوابات دفع/ر.س/IBAN…).
  - `redactAdminLogRows(rows, redact)` يستبدل ملاحظة السطر المالي بـ
    **«🔒 تفاصيل مالية محجوبة (تتطلب صلاحية مالية)»** مع إبقاء الفعل والهدف والوقت للمساءلة.
  - الخيار متاح على `listAdminLog` و`getUserAdminLog` (بلا حجب افتراضيًا).
- **تدقيق المالية المستقل:** `src/lib/finance/audit-visibility.ts` (`redactFinanceAudit`) يحجب
  تفاصيل كل قيد مالي حسب وحدته المصدر (invoices/settlements/tax/…)، فيصل فشل الحجب إلى وضع
  آمن (fail-closed).
- **التحقّق:** `tests/unit/audit-financial-redaction.test.ts`،
  `tests/unit/audit-only-role.test.ts` (حساب `audit:view` فقط: يفتح السجل، المبالغ محجوبة،
  و`finance`/`access-control` مرفوضة)، و`tests/unit/finance-audit-visibility.test.ts`،
  ومجموعتا التكامل access-control/finance على MySQL في CI. **وأُكِّد حيًّا على trbhh.sa**
  بحساب مدقق حقيقي أنشأه المالك.

---

## 3) مسار Salla OAuth كما هو مطبّق فعليًا

الملفات: `src/lib/suppliers/salla-oauth.ts`، `merchant-oauth.ts`، `connections.ts`،
`config.ts`، `salla-scope-contract.ts`، والمسارات `src/app/api/integrations/salla/{authorize,callback,webhooks,invite}/route.ts`.

- **نقطة تفويض سلة:** `https://accounts.salla.sa/oauth2/auth`
- **عنوان الإرجاع (redirect_uri):** `https://trbhh.sa/api/integrations/salla/callback`
- **النطاقات المطلوبة (7):**
  `offline_access products.read customers.read customers.read_write metadata.read orders.read orders.read_write`
  (نسخة العقد `SALLA_OAUTH_SCOPE_VERSION = 1`؛ نقص أي نطاق ⇒ «يحتاج إعادة تفويض»).
- **رابط المالك = رابط دعوة موقّع** (وليس رابط سلة المباشر):
  `https://trbhh.sa/api/integrations/salla/authorize?invite=<token>`
  - يولّده مشرف عبر `issueMerchantInvitation` (إجراء `connectSalla`) — موقّع HMAC بمفتاح الخادم
    `SUPPLIER_TOKEN_ENCRYPTION_KEY`، صالح **٢٤ ساعة**، ومربوط بالمورد واسمه المتوقّع و`generation`.
- **تدفّق الموافقة:**
  1. المالك يفتح رابط الدعوة → `GET` يعرض صفحة تأكيد «ربط <المتجر> بتربح» (زر «متابعة التفويض
     في سلة»). الـ`GET` غير مستهلِك للدعوة (معاينات الروابط لا تُفعّلها).
  2. الضغط يرسل `POST` (تحقق Origin + CSRF cookie + `integrations:authorize`) →
     `startMerchantOAuth` → إعادة توجيه إلى سلة مع `state` أحادي الاستخدام.
  3. بعد موافقة المالك: `callback` يتحقق من `state`، يبادل الرمز (`exchangeCode`)،
     ويتحقق من **هوية المتجر** (`verifyInvitedMerchant`: تطابق `store.id` والاسم، ورفض
     المتاجر التجريبية `demostore`/`development`)، ثم يخزّن التوكنات **مختومة** في
     `supplier_connections`.
- **التجديد:** `offline_access` + `refreshGrant` يجدّد الرمز قبل انتهائه؛ عدم التطابق في نسخة
  النطاقات يفرض إعادة تفويض.
- **الحالة:** `resolveSupplierOAuthStatus` → «مفوّض» فقط عند
  `status='connected' && scopeVersion=1 && hasTokens`؛ وإلا «بانتظار/منتهٍ/يحتاج إعادة تفويض/غير مفوّض».
- **تحقّق حيّ (بلا صلاحيات) على الإنتاج:** `authorize` بلا دعوة ⇒ `400` «رابط التفويض غير صالح»،
  `authorize?invite=bad` ⇒ `400`، `callback` بلا رمز ⇒ `403`. أي النقاط منشورة وتتحقّق فعلًا.

---

## 4) رابط التفويض قابل لإعادة المحاولة ولا يُستهلك عند الفشل

مؤكّد من `authorize/route.ts` و`merchant-oauth.ts`:

- **الـ`GET` لا يستهلك الدعوة** إطلاقًا — يعرض صفحة التأكيد فقط.
- **إعادة المحاولة مسموحة داخل صلاحية الدعوة (٢٤ ساعة):** يُحتفظ بإثبات CSRF لزر الرجوع/إعادة
  المحاولة، وتُحمى كل محاولة منفصلة بفحص Origin و**`state` أحادي الاستخدام** (على مستوى كل
  محاولة، لا على مستوى الدعوة).
- **الفشل لا يبطل الدعوة:** انقطاع/إلغاء المالك لا يغيّر `oauth_generation`؛ فيعاد فتح نفس الرابط
  والمحاولة مجددًا.
- **إصدار دعوة جديدة** يرفع `oauth_generation` فيُبطل الدعوات الأقدم دون المساس بأي ربط قائم.
- سجلّ Codex يؤكّد ذلك: «Allow retrying Salla owner authorization»، «Make Salla authorization
  renewable and resilient»، «allow merchant login redirects and repeat form attempts».

---

## 5) صلاحيات صفحة `/admin/suppliers/integrations`

- **عرض الصفحة:** `requireAdminPage('/admin/suppliers/integrations')` ⇒ **`integrations:view`**.
- **الإجراءات (كلها خادمية عبر `requireAccess`):**
  | الإجراء | الصلاحية المطلوبة |
  |---|---|
  | `connectSalla` (توليد رابط تفويض المالك) | `integrations:authorize` |
  | `disconnectSalla` (فصل الربط) | `integrations:authorize` |
  | `synchronize` (مزامنة يدوية) | `integrations:sync` |
  | `saveProfile` (إعدادات المزوّد) | `integrations:manage_settings` |
  | `saveProduct` (تعديل منتج) | `products:edit` |
  | `disableProduct` (تعطيل منتج) | `products:suspend` |
  | `saveTrackingLabels` (تسميات الشحن) | `shipping:manage_settings` |
  | `saveTier` (شرائح التسعير) | `pricing:manage_settings` |
- تعرض الصفحة: **حالة التفويض** + **Merchant/Store ID** (`external_store_id`) + **عدد المنتجات**.

---

## 6) الشراء والدفع والنشر التلقائي — معطّلة (مؤكّد خادميًا)

- **الشراء المركزي معطّل افتراضيًا:** `commerce_purchasing_enabled = '0'`
  (`src/lib/commerce/config.ts`)، مع فرض خادمي في:
  `src/app/shop/actions.ts`، `src/app/account/orders/actions.ts`،
  `src/lib/commerce/orders.ts` (قراءة `site_settings` مباشرةً)، `src/lib/commerce/gateway.ts`.
- **الطلبات الحيّة للمورّد معطّلة:** `SUPPLIER_ALLOW_LIVE_ORDERS=false`؛ إنشاء طلب Salla
  يرمي `unsupported_live_order_contract`، وإنشاء طلب CJ محكوم بحارسين (`commerce_purchasing_enabled`
  + `SUPPLIER_ALLOW_LIVE_ORDERS`).
- **النشر التلقائي للمنتجات معطّل:** منتجات المزامنة تُكتب في `supplier_products` بقيم إدارية
  افتراضية **مخفية/غير مفعّلة/غير مربوطة** (`src/lib/suppliers/catalog.ts`: «schema defaults are
  hidden/inactive/unmapped»)، فلا تظهر للعامة إلا بعد اعتماد المشرف يدويًا وربطها بـ
  `commerce_products` وإظهارها.

---

## 7) خطوات الربط التي سينفّذها صاحب المتجر لاحقًا («شعبيات الأولين»)

جاهزة للتنفيذ متى توفّر صاحب المتجر:

1. **المشرف** يفتح `/admin/suppliers/integrations` → بطاقة «شعبيات الأولين» → يضغط
   **«تفويض/ربط سلة»** (`connectSalla`) فيحصل على **رابط دعوة موقّع** (٢٤ ساعة).
2. **صاحب المتجر** يفتح الرابط على متصفّحه (Chrome Android مثلًا) → يضغط «متابعة التفويض في سلة».
3. يسجّل الدخول بحساب **صاحب المتجر** في سلة ويوافق على النطاقات (قراءة بيانات المتجر والمنتجات
   والطلبات) — لا شراء ولا دفع.
4. يعود تلقائيًا إلى `callback` الذي يتحقق من هوية المتجر ويخزّن التوكن؛ تتحوّل الحالة إلى **«مفوّض»**.
5. **المشرف** يشغّل **«مزامنة»** (`synchronize`) لجلب المنتجات إلى `supplier_products`.
6. **التحقّق المطلوب بعدها:** Connected + Merchant/Store ID + عدد المنتجات + عيّنة منتج
   (اسم/سعر/مخزون/صورة). لو نُشِر منتج للعامة يمكن تأكيده حيًّا على trbhh.sa.

> ملاحظة أمان: رابط المالك قابل لإعادة المحاولة ولا يُستهلك عند الفشل (§4)، ولا يُفعّل شراءً ولا
> دفعًا. إن انتهت الـ٢٤ ساعة يُصدر المشرف رابطًا جديدًا (يُبطل القديم دون المساس بأي ربط قائم).
