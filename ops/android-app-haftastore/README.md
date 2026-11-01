# تطبيق أندرويد المنشور — `app.haftastore.com` (تربح)

هذا هو **التطبيق المنشور فعلًا في Google Play** (178 تثبيتًا)، وليس `com.trbhh.app` الموجود في
`apps/android-twa` (تطبيق آخر في الاختبار الداخلي لا يُستخدم).

## الحالة (2026-11-02)
- مفتاح الرفع الأصلي كان مفقودًا؛ طُلبت **إعادة ضبط مفتاح الرفع** من Play Console، والمفتاح الجديد صالح من
  **2026-11-03 الساعة 1:52 صباحًا**.
- الإصدار الجاهز للرفع: **8.1.0 (رمز 50)**، يستهدف Android 16 (API 36، يحل إنذاري السياسات)، والحد الأدنى
  Android 7 (API 24، تشترطه androidbrowserhelper)، والأيقونة الجديدة، والدومين `trbhh.sa`.
- بطاقة المتجر (الأيقونة وصورة الميزة واللقطات والوصف) حُدّثت ونُشرت 2026-11-01.
- Play Console: **النشر المُدار مفعّل**؛ بعد كل موافقة يلزم الضغط على «نشر».

## الملفات هنا
| الملف | |
|---|---|
| `twa-manifest.json` | إعداد Bubblewrap (الحزمة، الإصدار، الدومين، الألوان). الأيقونات تُخدم محليًا أثناء البناء |
| `build.sh` | يبني ويوقّع AAB وAPK داخل حاوية `cimg/android:2024.10.1-node` |
| `trbhh-icon-512.png` | أيقونة المتجر والتطبيق |
| `trbhh-maskable-512.png` | أيقونة الشاشة الرئيسية القابلة للقص |

## البناء
السكربت يتوقع على الخادم الذي يبني:
- `/root/trbhh-android/src/` فيه `twa-manifest.json` و`build.sh` و`icon-512.png` و`maskable-512.png`.
- `/root/trbhh-android/keys/upload.jks` ومعه ملف `password` (**لا يُرفعان لأي مستودع**؛ مكانهما الفعلي
  مكتوب في الوثيقة التشغيلية الخاصة لدى المالك).

ثم: `bash /root/trbhh-android/src/build.sh` ← `/root/trbhh-android/project/trbhh.aab`.

## إصدار تحديث لاحقًا
ارفع `appVersionCode` و`appVersionName` و`appVersion` ورقم `v=` في `startUrl`، ثم ابنِ وارفع الـ AAB.

## assetlinks
الحزمة `app.haftastore.com` وبصمة توقيع Google تُضبطان من **إدارة تربح ← الإعدادات ← التطبيقات**، ويخدمها
المسار `/api/assetlinks` عبر `/.well-known/assetlinks.json` (حُذف الملف الثابت القديم الذي كان يغطي عليه).
