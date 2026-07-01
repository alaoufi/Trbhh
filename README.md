# تربح | Trbhh — منصة الإعلانات المبوبة والأعمال التجارية B2B

نسخة حديثة ومتطورة من منصة [تربح](https://trbhh.com) مبنية بـ **Next.js 15** و **TypeScript**
و **Prisma** على **MySQL**، ومهيّأة للنشر على **Hostinger VPS** عبر Docker.

المنصة **ليست وسيطاً مالياً** — دورها عرض الإعلانات وربط الأطراف فقط، وكل تعامل أو دفع يتم
خارج المنصة مباشرة بين الطرفين.

---

## المزايا المنجزة

**الواجهة العامة**
- ✅ واجهة عربية RTL حديثة (TailwindCSS + مكوّنات على نمط shadcn) — متجاوبة مع شريط سفلي للجوال.
- ✅ الرئيسية: بحث، إحصائيات مباشرة، الأقسام، إعلانات مميّزة/أحدث/الأكثر مشاهدة.
- ✅ تصفّح الأقسام + صفحة القسم + البحث المتقدم + تفاصيل الإعلان (معرض صور، واتساب/اتصال/مراسلة، مفضلة، تعليقات، بلاغ، Schema.org).

**الأعضاء وإدارة الإعلانات**
- ✅ دخول/تسجيل — **الأعضاء الحاليون يدخلون بنفس كلمات مرورهم القديمة** (توافق bcrypt `$2y$`).
- ✅ لوحة العضو: إعلاناتي، المفضلة، الملف الشخصي، توثيق الحساب، صفحة الشركة.
- ✅ إضافة/تعديل/حذف الإعلانات مع رفع صور متعددة (مسار وسائط موحّد `/media`: تخزين محلي + بروكسي تلقائي لصور الأصل).

**التفاعل والإدارة**
- ✅ رسائل داخلية، تعليقات، نقاشات (شات) بإعجابات، تنبيهات، صفحات أعضاء، صفحات شركات + فروع + كتالوج.
- ✅ نظام بلاغات وتوثيق، ولوحة إدارة محمية (`is_admin`): مستخدمون/إعلانات/أقسام/بلاغات/طلبات توثيق.

**البنية والنشر**
- ✅ استيراد بيانات MySQL الأصلية بالكامل دون فقدان.
- ✅ Redis للكاش، PWA (manifest + service worker)، SEO (sitemap + robots)، Docker كامل + سكربتات نشر/نسخ احتياطي/SSL.

## التقنيات

| الطبقة | التقنية |
|--------|---------|
| الواجهة | Next.js 15 (App Router) · React 19 · TypeScript · TailwindCSS |
| الخادم | Next.js Server Components + Server Actions |
| قاعدة البيانات | MySQL 8 · Prisma ORM (مخطط مستخرج من القاعدة الأصلية) |
| الكاش/الجلسات | Redis (ioredis) · جلسات JWT موقّعة (jose) |
| الصور | next/image + مُحوّل وسائط قابل للتهيئة |
| النشر | Docker · Nginx · Let's Encrypt |

---

## التشغيل محلياً

### الطريقة الأسرع (Docker — يستورد البيانات تلقائياً)
```bash
cp .env.example .env          # عدّل كلمات المرور و AUTH_SECRET
docker compose up -d --build  # يبني التطبيق ويشغّل MySQL/Redis/Nginx
# يستورد database/trbhh.sql.gz تلقائياً عند أول تشغيل
```
ثم افتح: http://localhost

### تطوير مباشر (بدون Docker للتطبيق)
```bash
# 1) شغّل قاعدة البيانات فقط
docker compose up -d db redis
bash scripts/import-db.sh database/trbhh.sql.gz   # عند الحاجة

# 2) شغّل التطبيق
pnpm install
export DATABASE_URL="mysql://trbhh:PASSWORD@127.0.0.1:3306/trbhhdb"
pnpm prisma generate
pnpm dev            # http://localhost:3000
```

---

## النشر على Hostinger VPS (Ubuntu 24.04)

```bash
# على الـ VPS
git clone <REPO_URL> trbhh && cd trbhh
cp .env.example .env && nano .env          # املأ القيم الحقيقية
openssl rand -hex 32                        # ضعه في AUTH_SECRET

bash scripts/deploy.sh                      # يبني ويشغّل كل شيء
bash scripts/init-ssl.sh trbhh.com admin@trbhh.com   # شهادة SSL مجانية
```

### النسخ الاحتياطي اليومي
```bash
# crontab -e
0 2 * * * cd /root/trbhh && bash scripts/backup.sh
```

راجع `docker/nginx.conf` لتفعيل HTTPS بعد إصدار الشهادة.

---

## الوسائط (الصور)

الصور مخزّنة في القاعدة الأصلية كمسارات ملفات وتُخدم من جذر الموقع. المتغيّر
`NEXT_PUBLIC_MEDIA_BASE` يتحكّم بمصدرها:

- **أثناء الترحيل/الاختبار:** `https://trbhh.com` (التخزين الأصلي — تعمل الصور فوراً).
- **في الإنتاج:** بعد نسخ مجلد التخزين إلى الـ VPS، غيّره إلى نطاقك أو CDN خاص بك.

---

## بنية المشروع

```
src/
  app/            صفحات App Router (الرئيسية، الأقسام، الإعلان، البحث، الدخول)
  components/     مكوّنات الواجهة (الهيدر، الفوتر، البطاقات، الشريط السفلي)
  lib/            prisma · redis · auth · data (طبقة الوصول للبيانات) · media · utils
prisma/schema.prisma   المخطط المستخرج من قاعدة البيانات الأصلية
database/              نسخة البيانات المضغوطة + الاستيراد التلقائي
docker/               nginx.conf + بيانات الحاويات + شهادات certbot
scripts/              deploy · import-db · init-ssl · backup
```

## تحسينات مستقبلية مقترحة

الموقع مكتمل ويعمل ببياناتك الحقيقية. تحسينات اختيارية لاحقاً:
رسائل فورية عبر WebSocket (بدل التحديث) · إشعارات Push عبر FCM · لوحة إحصائيات متقدمة للأعضاء الموثّقين ·
مقارنة الإعلانات وQR لكل إعلان · تطبيقات Android/iOS (الـ API جاهز عبر Server Actions/Route Handlers).
