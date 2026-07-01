# تربح | Trbhh — منصة الإعلانات المبوبة والأعمال التجارية B2B

نسخة حديثة ومتطورة من منصة [تربح](https://trbhh.com) مبنية بـ **Next.js 15** و **TypeScript**
و **Prisma** على **MySQL**، ومهيّأة للنشر على **Hostinger VPS** عبر Docker.

المنصة **ليست وسيطاً مالياً** — دورها عرض الإعلانات وربط الأطراف فقط، وكل تعامل أو دفع يتم
خارج المنصة مباشرة بين الطرفين.

---

## المزايا المنجزة

- ✅ واجهة عربية RTL حديثة (TailwindCSS + مكوّنات على نمط shadcn) — متجاوبة مع شريط سفلي للجوال.
- ✅ الصفحة الرئيسية: بحث، إحصائيات مباشرة، الأقسام، إعلانات مميّزة/أحدث/الأكثر مشاهدة.
- ✅ تصفّح الأقسام + صفحة القسم + البحث المتقدم (كلمة/قسم/نوع).
- ✅ صفحة تفاصيل الإعلان: معرض صور، بيانات البائع (توثيق)، أزرار واتساب/اتصال، Schema.org (SEO).
- ✅ تسجيل الدخول/التسجيل — **الأعضاء الحاليون يدخلون بنفس كلمات مرورهم القديمة**
  (توافق كامل مع تشفير Laravel bcrypt `$2y$`).
- ✅ استيراد بيانات MySQL الأصلية بالكامل دون فقدان (المستخدمون، الإعلانات، الأقسام، المشاهدات…).
- ✅ Redis للكاش (اختياري في التطوير)، صور WebP/AVIF عبر next/image.
- ✅ Docker Compose كامل (app + MySQL + Redis + Nginx) + سكربتات نشر ونسخ احتياطي وSSL.

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

## خارطة الطريق (المراحل القادمة)

الأساس يعمل ببياناتك الحقيقية. المراحل التالية المقترحة:
لوحة تحكم الأعضاء وإدارة الإعلانات · نظام الرسائل الفوري · صفحات الشركات والكتالوج ·
لوحة الإدارة · نظام البلاغات والتوثيق · التنبيهات الذكية · تطبيق PWA.
