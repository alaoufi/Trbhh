# قاعدة البيانات

- `trbhh.sql.gz` — نسخة كاملة من قاعدة البيانات الأصلية (mysqldump) مضغوطة.
  يقوم `docker compose up` باستيرادها تلقائياً عند أول تشغيل عبر
  مجلد `docker-entrypoint-initdb.d`.

## استيراد يدوي
```bash
bash scripts/import-db.sh database/trbhh.sql.gz
```

> ملاحظة: قاعدة البيانات مستخرجة عبر `prisma db pull`، ومخطط Prisma في
> `prisma/schema.prisma` يعكس نفس الجداول والعلاقات دون أي فقدان للبيانات.
