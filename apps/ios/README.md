# تطبيق آيفون — تربح (غلاف PWA)

أسرع مسار معتمد: توليد مشروع iOS جاهز من **PWABuilder** ثم رفعه عبر Xcode.
النسخة: **2.0.0 (Build 2)** — يفتح الموقع بـ `/?app=ios&v=2` ليعمل **التحديث الإجباري**
(رفع «أدنى نسخة آيفون» في إعدادات الإدارة يحجب الأقدم بشاشة تحديث).

## المتطلبات (مرة واحدة)
- حساب Apple Developer (99$/سنة): https://developer.apple.com/programs/enroll/
- جهاز Mac عليه Xcode (أو خدمة Mac سحابية مثل MacinCloud لجلسة واحدة).

## التوليد
1. افتح https://www.pwabuilder.com وأدخل: `https://trbhh.com`
2. اختر **iOS** ← Generate Package ← نزّل مشروع Xcode.
3. افتح المشروع في Xcode واضبط:
   - **Bundle Identifier**: `com.trbhh.app`
   - **Version**: `2.0.0` — **Build**: `2`
   - رابط البداية في إعدادات المشروع (ملف الإعدادات/`Settings`): `https://trbhh.com/?app=ios&v=2`
   - الأيقونة: مولّدة تلقائياً من المانيفست (مصدرها `icon-512.png`) — وللمتجر استخدم
     `public/play/store-icon-1024.png` (مقاس App Store: 1024×1024 بلا شفافية ✓).
4. Product ← Archive ← Distribute App ← App Store Connect.

## في App Store Connect (https://appstoreconnect.apple.com)
- أنشئ التطبيق بنفس الـ Bundle ID.
- **App Privacy**: عيّن سياسة الخصوصية `https://trbhh.com/privacy` وأجب عن جمع البيانات
  (المعرّفات: رقم الجوال والاسم — لأغراض عمل التطبيق، غير مستخدمة للتتبع).
- **حذف الحساب (متطلب Apple 5.1.1(v))**: متوفر داخل التطبيق من
  «حسابي ← حذف الحساب» وعلى `https://trbhh.com/delete-account` — اذكر ذلك في
  ملاحظات المراجعة (Review Notes) مع حساب تجريبي للمراجعين.
- لقطات شاشة آيفون 6.7″ (1290×2796): صوّرها من التطبيق بعد تشغيله.
- بعد النشر ضع **رابط App Store** في إدارة تربح ← الإعدادات ← التطبيقات.

## إصدار تحديث مستقبلاً
ارفع Version/Build في Xcode + غيّر `v=` في رابط البداية → Archive → رفع.
ثم ارفع «أدنى نسخة آيفون» في إعدادات الإدارة عندما تريد إجبار التحديث.
