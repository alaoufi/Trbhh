#!/usr/bin/env bash
# استرجاع قاعدة بيانات «تربح» من نسخة مشفّرة في مخزن R2 (يُشغَّل من backup-watch.sh عند طلب من
# لوحة الإدارة، أو يدوياً):   bash restore.sh daily/trbhh-2026-11-19T03-17-00Z.tar.gpg
# الترتيب، ويتوقف عند أول فشل قبل المساس بالقاعدة:
#   1. تنزيل النسخة وفك تشفيرها ومطابقة SHA256SUMS وقراءة التفريغ.
#   2. نسخة أمان كاملة من الحالة الحالية إلى المخزن (manual) — إن فشلت لا يُسترجع شيء.
#   3. إيقاف التطبيق، استبدال القاعدة، تشغيل التطبيق، تفريغ الذاكرة المؤقتة.
# يسترجع قاعدة البيانات فقط: الكود والأسرار والوسائط لا تُمسّ. النتيجة تُسجَّل في restore_last_*.
set -euo pipefail
export PATH="/srv/trbhh/bin:$PATH"
umask 077
KEYNAME="${1:-}"
[[ "$KEYNAME" =~ ^(daily|manual)/trbhh-[0-9TZ:-]+\.tar\.gpg$ ]] || { echo "اسم نسخة غير صالح" >&2; exit 2; }
D=/opt/trbhh/deploy/edge-server
REMOTE="${TRBHH_BACKUP_REMOTE:-trbhh-backups:trbhh-backups}"
KEY=/etc/trbhh/backup.key
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
RC=(rclone --config /etc/trbhh/rclone.conf --bind "$BIND" --s3-no-check-bucket)
# shellcheck disable=SC1091
. /etc/trbhh/db.env
my() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot --default-character-set=utf8mb4 "$@"; }
setting() { printf "INSERT INTO site_settings (k, v) VALUES ('%s', '%s') ON DUPLICATE KEY UPDATE v = VALUES(v);\n" "$1" "${2//\'/}" | my -N -B "$MYSQL_DATABASE" >/dev/null 2>&1 || true; }
exec 8> /run/trbhh-restore.lock
flock -n 8 || { echo "استرجاع آخر يعمل الآن"; exit 3; }
WORK="$(mktemp -d /srv/trbhh/tmp/restore.XXXXXX)"
STAGE="التحضير"; SAFETY=""; APP_STOPPED=0
finish() {
  local code=$?
  rm -rf "$WORK"
  [[ $APP_STOPPED -eq 1 ]] && docker start trbhh-app >/dev/null 2>&1 || true
  if [[ $code -ne 0 ]]; then setting restore_last_status "فشل عند: $STAGE"; setting restore_last_at "$(date -u +%FT%T.000Z)"; echo "RESTORE_FAIL عند: $STAGE"; fi
}
trap finish EXIT

STAGE="تنزيل النسخة وفحصها"
"${RC[@]}" copyto "$REMOTE/$KEYNAME" "$WORK/b.tar.gpg"
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-file "$KEY" "$WORK/b.tar.gpg" | tar -C "$WORK" -xf -
B="$(find "$WORK" -maxdepth 1 -type d -name 'trbhh-*' | head -1)"
( cd "$B" && sha256sum --quiet -c SHA256SUMS )
TABLES="$(zcat "$B/database.sql.gz" | grep -c '^CREATE TABLE' || true)"
zcat "$B/database.sql.gz" | tail -1 | grep -q 'Dump completed' || { echo "التفريغ في النسخة غير مكتمل" >&2; exit 1; }
[[ "$TABLES" -gt 50 ]] || { echo "التفريغ في النسخة ناقص ($TABLES جدولاً)" >&2; exit 1; }

STAGE="نسخة الأمان من الحالة الحالية"
SAFETY="$(bash "$D/backup.sh" manual | sed -n 's/^BACKUP_OK \([^ ]*\).*/\1/p')"
[[ -n "$SAFETY" ]] || { echo "تعذّر أخذ نسخة الأمان — لم يُسترجع شيء" >&2; exit 1; }

STAGE="استبدال قاعدة البيانات"
if docker inspect trbhh-app >/dev/null 2>&1; then docker stop trbhh-app >/dev/null; APP_STOPPED=1; fi
my -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
zcat "$B/database.sql.gz" | my "$MYSQL_DATABASE"
GOT="$(my -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$MYSQL_DATABASE' AND table_type='BASE TABLE'")"
[[ "$GOT" -ge "$TABLES" ]] || { echo "عدد الجداول بعد الاسترجاع ($GOT) أقل من النسخة ($TABLES)" >&2; exit 1; }

STAGE="تشغيل الموقع"
docker restart trbhh-redis >/dev/null 2>&1 || true # الذاكرة المؤقتة تخص البيانات السابقة
if [[ $APP_STOPPED -eq 1 ]]; then
  docker start trbhh-app >/dev/null; APP_STOPPED=0
  for _ in $(seq 1 60); do curl -fsS --max-time 5 -H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https' -o /dev/null http://127.0.0.1:8101/ 2>/dev/null && break; sleep 2; done
fi
setting restore_last_name "$KEYNAME"
setting restore_last_safety "$SAFETY"
setting restore_last_status ok
setting restore_last_at "$(date -u +%FT%T.000Z)"
# طلبات النسخ/الاسترجاع المخزّنة داخل النسخة المسترجَعة قديمة: نثبّت آخر نسخة حتى لا تُعاد.
setting backup_last_at "$(date -u +%FT%T.000Z)"
echo "RESTORE_OK $KEYNAME tables=$GOT safety=$SAFETY"
