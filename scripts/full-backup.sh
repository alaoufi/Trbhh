#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# نسخة احتياطية كاملة شاملة: الكود + قاعدة البيانات الحيّة + الوسائط المرفوعة
# + دليل المطوّر — في ملف مضغوط واحد باسم «تربح-<التاريخ>-<الوقت>.zip».
#
# التشغيل على الخادم:  cd /root/trbhh && bash scripts/full-backup.sh
# الناتج يوضع في مجلد backups/ داخل المستودع.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true

STAMP="$(date +%Y%m%d-%H%M)"
NAME="تربح-${STAMP}"
OUT="backups/${NAME}"
mkdir -p "$OUT"

echo "==> [1/4] أرشفة الكود (الملفات المتتبَّعة فقط — بلا node_modules/.next/.git)…"
git archive --format=tar HEAD | tar -x -C "$OUT"

echo "==> [2/4] تفريغ قاعدة البيانات الحيّة…"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-changeme_root}"
DB_NAME="${DB_NAME:-trbhhdb}"
if docker compose exec -T db mysqldump -uroot -p"$DB_ROOT_PASSWORD" \
     --single-transaction --routines --triggers "$DB_NAME" \
     | gzip > "$OUT/database/trbhh-live-${STAMP}.sql.gz"; then
  echo "    تم: database/trbhh-live-${STAMP}.sql.gz (قاعدة الإنتاج الحيّة)"
else
  echo "    تحذير: تعذّر تفريغ القاعدة الحيّة — سيعتمد الأرشيف على database/trbhh.sql.gz المضمّن."
fi

echo "==> [3/4] نسخ الوسائط المرفوعة (الصور/السندات)…"
STORAGE_SRC="${STORAGE_DIR:-/app/storage}"
# على الخادم، مجلد التخزين مربوط كـ volume — انسخه إن وُجد على المضيف
if [ -d "storage" ]; then
  cp -a storage "$OUT/storage" && echo "    تم نسخ ./storage"
elif docker compose ps -q app >/dev/null 2>&1; then
  mkdir -p "$OUT/storage"
  docker compose cp "app:${STORAGE_SRC}/." "$OUT/storage/" 2>/dev/null \
    && echo "    تم نسخ الوسائط من الحاوية (${STORAGE_SRC})" \
    || echo "    تحذير: تعذّر نسخ الوسائط — تحقق من STORAGE_DIR."
fi

echo "==> [4/4] الضغط في ملف واحد…"
mkdir -p backups
( cd backups && zip -qr "${NAME}.zip" "${NAME}" && rm -rf "${NAME}" )

FINAL="backups/${NAME}.zip"
SIZE="$(du -h "$FINAL" | cut -f1)"
echo ""
echo "✅ تمّت النسخة الاحتياطية الكاملة: ${FINAL} (${SIZE})"
echo "   تحتوي: الكود + قاعدة البيانات الحيّة + الوسائط المرفوعة + دليل المطوّر."
echo "   لنقلها لجهازك:  scp root@SERVER_IP:/root/trbhh/${FINAL} ."
