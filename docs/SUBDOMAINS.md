# نطاقات المتاجر الفرعية (saud.trbhh.com)

يمنح كل متجر رابطاً مستقلاً على هيئة نطاق فرعي. الجزء البرمجي **جاهز**:
- التاجر يحدّد «معرّف المتجر» (handle) من مصمّم المتجر → يصبح `saud.trbhh.com`.
- `middleware` يوجّه `*.trbhh.com` تلقائياً لصفحة المتجر المطابقة.
- nginx يمرّر `*.trbhh.com` إلى التطبيق (server_name محدّث).

يبقى إعدادان **على الخادم** لتفعيل النطاق الفرعي فعلياً:

## 1) سجل DNS Wildcard
في لوحة إدارة نطاق `trbhh.com` (Hostinger / مزوّد الـDNS) أضِف:

```
Type: A     Name: *      Value: <IP سيرفرك>     TTL: 3600
```

(`*` يغطّي كل النطاقات الفرعية دفعة واحدة. أبقِ سجلّي `@` و`www` كما هما.)

تحقّق بعد الانتشار:
```bash
dig +short saud.trbhh.com   # يجب أن يُرجع IP سيرفرك
```

## 2) شهادة SSL Wildcard (`*.trbhh.com`)
شهادة HTTP‑01 العادية تغطّي الأسماء المحددة فقط، فالنطاقات الفرعية تحتاج
شهادة **Wildcard** تُصدَر عبر **DNS‑01**. مثال بـ certbot و إضافة DNS
(استبدل الإضافة بما يناسب مزوّدك، أو استخدم `--manual`):

```bash
# مثال يدوي (يطلب منك إضافة سجل TXT مؤقت للتحقق):
certbot certonly --manual --preferred-challenges dns \
  -d 'trbhh.com' -d '*.trbhh.com' \
  --agree-tos -m alaoufi@gmail.com

# أضِف سجل TXT الذي يعرضه (‎_acme-challenge.trbhh.com‎) في لوحة الـDNS،
# انتظر انتشاره ثم أكمل. الشهادة تُحفظ في:
#   /etc/letsencrypt/live/trbhh.com/fullchain.pem
```

> للتجديد التلقائي استخدم إضافة DNS API لمزوّدك (مثل `certbot-dns-cloudflare`)
> بدل `--manual`، لأن الـwildcard لا يُجدَّد عبر HTTP‑01.

## 3) تفعيل HTTPS في nginx
في `docker/nginx.conf` فعّل بلوك `listen 443` (وأزل التعليق)، وتأكد أن
`server_name` يتضمن `*.trbhh.com` (محدّث مسبقاً)، ثم:

```bash
docker compose restart nginx
```

## التحقق النهائي
```bash
curl -I https://saud.trbhh.com     # 200، وتظهر صفحة متجر «saud»
```

إن لم يكن هناك متجر بهذا المعرّف يظهر 404 ودّي. النطاق الرئيسي `trbhh.com`
وكل مساراته تعمل كما هي دون تأثّر.
