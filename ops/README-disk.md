# إدارة مساحة قرص خادم تربح (Hostinger VPS)

> هذه الملفات تحت `ops/**` **لا تُطلق النشر التلقائي** (deploy.yml يتجاهل `ops/**`)،
> فيمكن دفعها بأمان دون إعادة نشر التطبيق.

## السبب الجذري لامتلاء القرص (183 → 371 GB في يوم)

كل `git push` إلى فرع النشر يبني ويُطلق نشراً كاملاً، وكل نشرة تكتب في
`/root/trbhh-release-backups/finance-<run_id>/` نسخة تحتوي:

- `image.tar.gz` — حفظ كامل لصورة التطبيق (`docker image save`) ≈ 1 GB لكل نشرة.
- `storage.tar.gz` + `legacy.tar.gz` — أرشفة كاملة لكل وسائط الموقع في كل نشرة.
- `storage-extracted/` + `legacy-extracted/` — **فكّ ضغط الوسائط مرة أخرى بلا ضغط**
  (مجرّد تحقق) وتبقى دون حذف.
- `database.sql.gz`, `code.tar.gz`, لقطات JSON…

**لا يوجد أي حذف/تقليم لهذه النسخ**، كما تتراكم صور `trbhh-finance:<sha>` و
`trbhh-rollback:<run_id>` وكاش بناء Docker مع كل نشرة. مع كثرة النشرات خلال 24 ساعة
(عمل Codex المالي + الدفعات) تراكمت عشرات النسخ بعدّة GB لكل واحدة ≈ **~188 GB**.

## التنظيف الفوري الآمن (نفّذه على الخادم الآن)

```bash
cd /root/trbhh && git fetch origin && git checkout origin/claude/hostinger-vps-project-amw8vb -- ops/  # أو انسخ الملفات
bash ops/vps-disk-cleanup.sh            # فحص فقط — يعرض التقرير دون حذف
bash ops/vps-disk-cleanup.sh --apply    # ينفّذ الحذف الآمن (extracted + نسخ قديمة + كاش + صور معلّقة)
```
يحفظ أحدث 3 نسخ احتياطية سليمة، ولا يلمس volumes/قاعدة البيانات/الأسرار/الوسائط الحيّة.

## منع التكرار (ثبِّت مرّة واحدة)

### 1) سياسة احتفاظ دورية
```bash
( crontab -l 2>/dev/null; echo '*/30 * * * * /bin/bash /root/trbhh/ops/vps-backup-retention.sh >> /var/log/trbhh-retention.log 2>&1' ) | crontab -
```

### 2) تدوير سجلات Docker (يمنع تضخّم json-log)
```bash
cp ops/daemon.json.example /etc/docker/daemon.json   # ادمجه إن كان موجوداً
systemctl reload docker || systemctl restart docker  # يُطبَّق على الحاويات الجديدة
```

### 3) تنبيه امتلاء القرص عند 70/80/90%
```bash
( crontab -l 2>/dev/null; echo '*/10 * * * * /bin/bash /root/trbhh/ops/vps-disk-alert.sh' ) | crontab -
# اختياري: export TRBHH_ALERT_WEBHOOK=... لإرسال تنبيه لسلاك/ديسكورد/تيليجرام
```

### 4) الحلّ الجذري في مسار النشر (مقترح لاحق)
تعديل `scripts/release/finance-backup.sh` ليحذف `*-extracted/` بعد التحقق مباشرة،
وإضافة خطوة احتفاظ في نهاية `finance-deploy.sh finalize` تُبقي آخر N نسخ فقط.
(لم يُعدَّل الآن لأن سكربتات النشر حسّاسة ويعمل عليها طرف آخر؛ سياسة الاحتفاظ عبر
cron أعلاه تعالج نفس المشكلة دون لمس مسار النشر.)

## ممنوع منعاً باتاً
`docker volume prune` · حذف أي volume · حذف قاعدة البيانات · حذف `.env`/الأسرار ·
حذف الوسائط الحيّة المستخدمة · حذف آخر نسخة احتياطية سليمة.
