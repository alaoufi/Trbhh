# تطبيق أندرويد (TWA) — تربح

تغليف الموقع `trbhh.com` كتطبيق أندرويد رسمي عبر Trusted Web Activity.
النسخة: **2.0.0 (versionCode 2)** — تفتح الموقع بـ `/?app=android&v=2` ليعمل
**التحديث الإجباري**: رفع «أدنى نسخة أندرويد» في إعدادات الإدارة يحجب أي نسخة أقدم بشاشة تحديث.

## البناء (على أي جهاز فيه Node)
```bash
npm i -g @bubblewrap/cli
cd apps/android-twa
bubblewrap build        # أول مرة: يثبّت JDK وأدوات أندرويد تلقائياً ويطلب إنشاء keystore
```
- سيُنشئ `android.keystore` — **احفظه جيداً + كلمة مروره** (يلزم لكل تحديث قادم).
- الناتج: `app-release-bundle.aab` (للرفع) و`app-release-signed.apk` (للتجربة على جهازك).

## بعد البناء — 3 خطوات إلزامية
1. **بصمة SHA-256**: يطبعها الأمر أو استخرجها بـ:
   ```bash
   keytool -list -v -keystore android.keystore -alias trbhh | grep SHA256
   ```
   ثم ضعها في **إدارة تربح ← الإعدادات ← التطبيقات ← بصمة SHA-256** واحفظ —
   هذا يفعّل `https://trbhh.com/.well-known/assetlinks.json` فيفتح التطبيق ملء الشاشة بلا شريط متصفح.
   > ملاحظة: عند استخدام Play App Signing (الافتراضي) أضف أيضاً بصمة Google من
   > Play Console ← Setup ← App integrity (يمكن وضع البصمتين مفصولتين بفاصلة).
2. **ارفع `app-release-bundle.aab`** في Play Console ← Production ← Create new release.
3. بعد النشر ضع **رابط المتجر** في إعدادات الإدارة ← التطبيقات.

## قائمة المتجر (Store listing)
- أيقونة التطبيق: `public/play/store-icon-1024.png`
- الرسم الترويجي: `public/play/feature-graphic-1024x500.png`
- سياسة الخصوصية: `https://trbhh.com/privacy`
- رابط حذف الحساب (نموذج أمان البيانات): `https://trbhh.com/delete-account`

## تحديث التطبيق القديم بدلاً من نشر جديد؟
التطبيق المنشور حالياً حزمته `app.haftastore.com`. لرفع تحديث **له** بدل تطبيق جديد يلزم:
- تغيير `packageId` هنا إلى `app.haftastore.com`، و
- التوقيع **بنفس مفتاح الرفع القديم** (ملف keystore القديم) — إن كان مفقوداً فاطلب
  «Upload key reset» من دعم Play، أو انشر التطبيق الجديد `com.trbhh.app` وألغِ نشر القديم بعد استقراره (الموصى به).

## إصدار تحديث مستقبلاً
ارفع `appVersionCode` و`appVersionName` هنا + حدّث `startUrl` (`v=3` مثلاً) → `bubblewrap build` → ارفع الـ aab.
ثم ارفع «أدنى نسخة» في إعدادات الإدارة **فقط عندما تريد إجبار الجميع** على التحديث.
