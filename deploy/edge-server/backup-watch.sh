#!/usr/bin/env bash
# مراقب طلبات لوحة الإدارة: يشغّله cron كل دقيقة.
#   - «خذ نسخة الآن»: backup_request_at أحدث من آخر نسخة ← نسخة يدوية كاملة.
#   - «استرجاع نسخة»: restore_request_at أحدث من آخر استرجاع ← restore.sh باسم النسخة المطلوبة.
# التطبيق لا يملك صلاحيات الخادم؛ هذا هو الجسر الوحيد. لا يُقرأ من القاعدة إلا «يوجد طلب» واسم
# نسخة يُتحقق من صيغته هنا وفي restore.sh — لا أوامر ولا مسارات.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. /etc/trbhh/db.env
docker inspect trbhh-db >/dev/null 2>&1 || exit 0
q() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot -N -B "$MYSQL_DATABASE" -e "$1" 2>/dev/null || true; }
newer() { q "SELECT IF(IFNULL((SELECT v FROM site_settings WHERE k='$1'),'') > IFNULL((SELECT v FROM site_settings WHERE k='$2'),''), 1, 0)"; }

if [[ "$(newer restore_request_at restore_last_at)" == 1 ]]; then
  key="$(q "SELECT v FROM site_settings WHERE k='restore_request_key'")"
  if [[ "$key" =~ ^(daily|manual)/trbhh-[0-9TZ:-]+\.tar\.gpg$ ]]; then
    bash "$D/restore.sh" "$key" >> /var/log/trbhh-backup.log 2>&1 || true
  else
    # طلب باسم غير صالح: يُغلق حتى لا يتكرر كل دقيقة.
    q "INSERT INTO site_settings (k, v) VALUES ('restore_last_status', 'اسم نسخة غير صالح'), ('restore_last_at', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.999Z')) ON DUPLICATE KEY UPDATE v = VALUES(v)"
  fi
  exit 0
fi
[[ "$(newer backup_request_at backup_last_at)" == 1 ]] || exit 0
bash "$D/backup.sh" manual >> /var/log/trbhh-backup.log 2>&1 || true
