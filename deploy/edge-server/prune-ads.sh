#!/usr/bin/env bash
# قرار المالك (2026-11-17): لا ينتقل إلى الخادم الجديد إلا الإعلانات المنشورة من آخر 90 يوماً
# مع وسائطها؛ بقية الإعلانات لا تنتقل. هذا السكربت يزيلها من قاعدة «تربح» على الخادم الجديد
# بعد الاستيراد وقبل فتح الموقع. قاعدة Hostinger والنسخة الكاملة المشفّرة في R2 لا تُمسّان.
#   bash prune-ads.sh plan              يعرض الأعداد فقط (لا يغيّر شيئاً)
#   bash prune-ads.sh apply --yes       ينفّذ الحذف داخل معاملة واحدة
# يعمل على الحاوية trbhh-db فقط. السجلات المالية والرقابية (transactions, payings, mod_log,
# notifications, comments, البلاغات، المزادات) لا تُحذف — كما يفعل التطبيق عند حذف إعلان.
set -euo pipefail
DAYS="${TRBHH_ADS_DAYS:-90}"
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "TRBHH_ADS_DAYS غير صالح" >&2; exit 2; }
# shellcheck disable=SC1091
. /etc/trbhh/db.env
sql() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot --default-character-set=utf8mb4 -N -B "$MYSQL_DATABASE"; }
KEEP="status = 1 AND (created_at IS NULL OR created_at >= NOW() - INTERVAL $DAYS DAY)"
# جداول تابعة للإعلان تُزال معه: الجدول:العمود
DEPS=(photos:other_id ads_views:ads_id favorites:ads_id store_products:ad_id ad_media:ad_id ad_category_values:ad_id ad_contacts:ad_id ad_show_reminders:ad_id ads_cities:ads_id)

plan() {
  echo "SELECT CONCAT('ads_total=', COUNT(*), ' keep=', SUM($KEEP), ' remove=', SUM(NOT ($KEEP))) FROM ads;" | sql
  for d in "${DEPS[@]}"; do t="${d%%:*}"; c="${d##*:}"
    echo "SELECT CONCAT('$t rows_to_remove=', COUNT(*)) FROM \`$t\` WHERE \`$c\` IN (SELECT id FROM ads WHERE NOT ($KEEP));" | sql 2>/dev/null || echo "$t: الجدول غير موجود (يُتجاوز)"
  done
}

apply() {
  {
    echo "START TRANSACTION;"
    echo "CREATE TEMPORARY TABLE _trbhh_remove (id BIGINT UNSIGNED PRIMARY KEY) AS SELECT id FROM ads WHERE NOT ($KEEP);"
    for d in "${DEPS[@]}"; do t="${d%%:*}"; c="${d##*:}"
      if echo "SELECT 1 FROM \`$t\` LIMIT 1;" | sql >/dev/null 2>&1; then echo "DELETE FROM \`$t\` WHERE \`$c\` IN (SELECT id FROM _trbhh_remove);"; fi
    done
    echo "DELETE FROM ads WHERE id IN (SELECT id FROM _trbhh_remove);"
    echo "COMMIT;"
    echo "SELECT CONCAT('PRUNE_OK ads_remaining=', COUNT(*)) FROM ads;"
  } | sql
}

case "${1:-}" in
  plan) plan ;;
  apply) [[ "${2:-}" == "--yes" ]] || { echo "للتنفيذ: bash $0 apply --yes (بعد مراجعة plan وموافقة المالك)" >&2; exit 2; }; plan; apply ;;
  *) echo "الاستعمال: $0 plan | apply --yes" >&2; exit 2 ;;
esac
