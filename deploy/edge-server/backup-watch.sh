#!/usr/bin/env bash
# مراقب «خذ نسخة الآن»: يشغّله cron كل دقيقة. إن سجّلت لوحة الإدارة طلباً (backup_request_at أحدث
# من آخر نسخة) يأخذ نسخة يدوية كاملة. التطبيق لا يملك صلاحيات الخادم؛ هذا هو الجسر الوحيد،
# ولا يقبل من القاعدة إلا «يوجد طلب» — لا أوامر ولا مسارات.
set -euo pipefail
# shellcheck disable=SC1091
. /etc/trbhh/db.env
docker inspect trbhh-db >/dev/null 2>&1 || exit 0
pending="$(docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot -N -B "$MYSQL_DATABASE" -e "SELECT IF(IFNULL((SELECT v FROM site_settings WHERE k='backup_request_at'),'') > IFNULL((SELECT v FROM site_settings WHERE k='backup_last_at'),''), 1, 0)" 2>/dev/null || echo 0)"
[[ "$pending" == 1 ]] || exit 0
bash "$(dirname "$0")/backup.sh" manual >> /var/log/trbhh-backup.log 2>&1 || true
