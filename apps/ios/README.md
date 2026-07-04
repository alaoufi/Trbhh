# تطبيق آيفون — تربح (مشروع Xcode جاهز)

المجلد يحتوي مشروع **Xcode جاهزاً بالكامل** (`Trbhh.xcodeproj`): غلاف WKWebView
يفتح الموقع بـ `https://trbhh.com/?app=ios&v=2` ليعمل **التحديث الإجباري**
(رفع «أدنى نسخة آيفون» في إعدادات الإدارة يحجب الأقدم بشاشة تحديث).

- **Bundle ID**: `com.trbhh.app` — **Version**: `2.0.0` — **Build**: `2`
- الأيقونة مضمّنة (1024×1024 بلا شفافية ✓) — روابط تربح تبقى داخل التطبيق،
  والروابط الخارجية و`tel:`/`mailto:`/واتساب تفتح خارجه — سحب للأسفل = تحديث.
- يتطلب **Xcode 16 أو أحدث** (صيغة المشروع المتزامنة مع المجلد).

## المتطلبات (مرة واحدة)
- حساب Apple Developer (99$/سنة): https://developer.apple.com/programs/enroll/
- جهاز Mac عليه Xcode (أو خدمة Mac سحابية مثل MacinCloud لجلسة واحدة).

## الرفع
1. افتح `apps/ios/Trbhh.xcodeproj` في Xcode.
2. في Signing & Capabilities اختر **Team** (حساب المطور) — التوقيع تلقائي.
3. جرّبه على المحاكي/جهازك، ثم: Product ← Archive ← Distribute App ← App Store Connect.

> بديل بلا Xcode يدوي: https://www.pwabuilder.com يولّد مشروعاً مشابهاً من
> `https://trbhh.com` — استخدم نفس Bundle ID والنسخة أعلاه.

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
ارفع MARKETING_VERSION/CURRENT_PROJECT_VERSION في Xcode + غيّر `v=` في
`ContentView.swift` → Archive → رفع. ثم ارفع «أدنى نسخة آيفون» في إعدادات
الإدارة عندما تريد إجبار التحديث.
