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

# قرار المالك (2026-11-19): إعلان ناقص من المصدر لا يُنشر — أي إعلان له صورة أو فيديو مذكور في
# القاعدة وغير موجود في المخزن (غير موجود في Hostinger أصلاً) يُزال من قاعدة الخادم الجديد.
incomplete() {
  local mode="$1" work; work="$(mktemp -d /srv/trbhh/tmp/incomplete.XXXXXX)"
  export PATH="/srv/trbhh/bin:$PATH"
  { echo "SELECT ph.other_id, u.file_name FROM photos ph JOIN ads a ON a.id=ph.other_id JOIN uploads u ON u.id=CAST(ph.photo_path AS UNSIGNED) WHERE u.file_name IS NOT NULL AND u.file_name<>'';" | sql
    echo "SELECT id, video_path FROM ads WHERE video_path LIKE '%/%';" | sql
    echo "SELECT a.id, u.file_name FROM ads a JOIN uploads u ON u.id=CAST(a.video_path AS UNSIGNED) WHERE a.video_path REGEXP '^[0-9]+\$' AND a.video_path<>'0' AND u.file_name<>'';" | sql
    # صف صورة يشير إلى رفع غير موجود في جدول uploads: مرجع ناقص أيضاً.
    echo "SELECT ph.other_id, CONCAT('<upload-row-missing:', ph.photo_path, '>') FROM photos ph JOIN ads a ON a.id=ph.other_id LEFT JOIN uploads u ON u.id=CAST(ph.photo_path AS UNSIGNED) WHERE u.id IS NULL OR u.file_name IS NULL OR u.file_name='';" | sql
  } | sed 's|\t/*|\t|' > "$work/refs.tsv"
  if [[ -n "${TRBHH_BUCKET_LIST:-}" ]]; then sort -u "$TRBHH_BUCKET_LIST" > "$work/bucket.txt"
  else rclone --config /etc/trbhh/rclone.conf --bind "$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)" lsf -R --files-only trbhh-media:trbhh-media | sort -u > "$work/bucket.txt"; fi
  [[ -s "$work/bucket.txt" ]] || { echo "تعذّر قراءة قائمة المخزن — لم يُحذف شيء" >&2; rm -rf "$work"; exit 1; }
  awk -F'\t' 'NR==FNR{have[$0]=1; next} !($2 in have){print $1}' "$work/bucket.txt" "$work/refs.tsv" | sort -un > "$work/ids.txt"
  local n; n=$(grep -c . "$work/ids.txt" || true)
  echo "incomplete_ads=$n (of $(echo 'SELECT COUNT(*) FROM ads;' | sql))"
  if [[ "$n" -gt 0 ]]; then
    local list; list="$(paste -sd, "$work/ids.txt")"
    echo "SELECT CONCAT('  ad ', id, ' status=', status, ' ', LEFT(title, 50)) FROM ads WHERE id IN ($list);" | sql
    awk -F'\t' 'NR==FNR{have[$0]=1; next} !($2 in have){print "  missing: ad " $1 " -> " $2}' "$work/bucket.txt" "$work/refs.tsv" | head -20
    # صمام أمان: عدد كبير غير متوقع لا يُحذف آلياً — يُعرض ليراجعه المالك أولاً.
    if [[ "$mode" == apply && "$n" -gt "${TRBHH_INCOMPLETE_MAX:-15}" ]]; then
      echo "INCOMPLETE_STOP: العدد $n أكبر من الحد ${TRBHH_INCOMPLETE_MAX:-15} — لم يُحذف شيء. راجع القائمة ثم أعد التشغيل بـ TRBHH_INCOMPLETE_MAX=$n" >&2
      rm -rf "$work"; exit 1
    fi
    if [[ "$mode" == apply ]]; then
      { echo "SELECT CONCAT(id, '\t', status, '\t', title) FROM ads WHERE id IN ($list);" | sql; } >> /srv/trbhh/removed-incomplete-ads.txt
      { echo "START TRANSACTION;"
        for d in "${DEPS[@]}"; do t="${d%%:*}"; c="${d##*:}"
          if echo "SELECT 1 FROM \`$t\` LIMIT 1;" | sql >/dev/null 2>&1; then echo "DELETE FROM \`$t\` WHERE \`$c\` IN ($list);"; fi
        done
        echo "DELETE FROM ads WHERE id IN ($list);"; echo "COMMIT;"
        echo "SELECT CONCAT('INCOMPLETE_REMOVED=$n ads_remaining=', COUNT(*)) FROM ads;"; } | sql
    fi
  fi
  echo "text_only_published_ads=$(echo "SELECT COUNT(*) FROM ads a WHERE a.status=1 AND NOT EXISTS (SELECT 1 FROM photos ph WHERE ph.other_id=a.id) AND (a.video_path IS NULL OR a.video_path IN ('','0'));" | sql) (إعلانات نصية بلا صور في المصدر — لم تُمسّ)"
  rm -rf "$work"
}

case "${1:-}" in
  incomplete-plan) incomplete plan ;;
  incomplete-apply) [[ "${2:-}" == "--yes" ]] || { echo "للتنفيذ: bash $0 incomplete-apply --yes" >&2; exit 2; }; incomplete apply ;;
  plan) plan ;;
  apply) [[ "${2:-}" == "--yes" ]] || { echo "للتنفيذ: bash $0 apply --yes (بعد مراجعة plan وموافقة المالك)" >&2; exit 2; }; plan; apply ;;
  *) echo "الاستعمال: $0 plan | apply --yes | incomplete-plan | incomplete-apply --yes" >&2; exit 2 ;;
esac
