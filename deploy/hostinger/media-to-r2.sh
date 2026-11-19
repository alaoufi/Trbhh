#!/usr/bin/env bash
# نقل وسائط «تربح» من خادم Hostinger إلى مخزن R2 مباشرةً (لا تمر بالخادم الجديد).
# ينقل وسائط الإعلانات المنشورة من آخر TRBHH_ADS_DAYS يوماً (الافتراضي 90) فقط — قرار المالك.
# وسائط الإعلانات الأقدم أو غير المنشورة لا تُنقل (TRBHH_PUBLISHED_ONLY=0 ينقل غير المنشور أيضاً).
# شعارات المتاجر وصور الحسابات والإيصالات وكل ما ليس صورة/فيديو إعلان قديم يُنقل كاملاً.
# وسائط الإعلانات القديمة تبقى على Hostinger ويمكن نقلها لاحقاً بـ TRBHH_ADS_DAYS=100000.
# نسخ فقط: لا يحذف ولا يعدّل أي ملف على Hostinger، ولا يحذف شيئاً من المخزن.
#   bash deploy/hostinger/media-to-r2.sh start    يبدأ النقل في الخلفية (يكمل لو انقطع الاتصال)
#   bash deploy/hostinger/media-to-r2.sh status   يعرض التقدم
#   bash deploy/hostinger/media-to-r2.sh verify   يطابق كل ملف مع المخزن ويطبع النتيجة
set -euo pipefail
REMOTE="${TRBHH_R2_REMOTE:-trbhh-media:trbhh-media}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE_FILTER="$HERE/media-filter.txt"
DAYS="${TRBHH_ADS_DAYS:-90}"
LOG=/root/trbhh-media-to-r2.log
WORK=/root/trbhh-media-to-r2
LEGACY="${TRBHH_LEGACY_DIR:-/home/trbhh/htdocs/haftastore/public}"
STORAGE="${TRBHH_STORAGE_DIR:-$(docker volume inspect trbhh_trbhh-storage --format '{{.Mountpoint}}')}"
FILTER="$WORK/filter.txt"
# مفتاح R2 مقيّد بعنوان الخادم IPv4. rclone القديم (1.60) لا يلتزم بـ--bind 0.0.0.0 فيخرج عبر
# IPv6 ويُرفض (403)، لذلك نربطه بعنوان IPv4 العام للخادم صراحةً إن كان على إحدى واجهاته.
BIND="${TRBHH_RCLONE_BIND:-}"
if [[ -z "$BIND" ]]; then
  pub="$(curl -4 -s --max-time 10 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' || true)"
  if [[ "$pub" =~ ^[0-9.]+$ ]] && ip -4 -o addr 2>/dev/null | grep -qw "$pub"; then BIND="$pub"; else BIND=0.0.0.0; fi
fi
RC=(rclone --bind "$BIND" --filter-from "$FILTER" --ignore-case --s3-no-check-bucket)

[[ -d "$LEGACY" && -d "$STORAGE" ]] || { echo "مجلد مصدر غير موجود: $LEGACY أو $STORAGE" >&2; exit 2; }
mkdir -p "$WORK"

# يبني قائمة الاستثناء من قاعدة البيانات (قراءة فقط) ثم ملف الفلتر النهائي.
prepare() {
  if [[ -n "${TRBHH_EXCLUDE_LIST:-}" ]]; then cp "$TRBHH_EXCLUDE_LIST" "$WORK/old-ads-media.txt"
  else docker exec -i -e DAYS="$DAYS" -e PUBLISHED_ONLY="${TRBHH_PUBLISHED_ONLY:-1}" -w /app trbhh-app node - < "$HERE/old-ads-media.cjs" > "$WORK/old-ads-media.txt" 2> "$WORK/prepare-summary.txt" || { cat "$WORK/prepare-summary.txt" >&2; echo "تعذّر بناء قائمة الإعلانات القديمة — لم يُنقل شيء" >&2; exit 4; }
  fi
  # كل مسار مستثنى يُكتب قاعدة مثبّتة مع تهريب رموز الأنماط.
  { sed -e 's/[][\\*?{}]/\\&/g' -e 's|^|- /|' "$WORK/old-ads-media.txt"; cat "$BASE_FILTER"; } > "$FILTER"
  echo "PREPARED days=$DAYS skipped_old_ad_files=$(grep -c . "$WORK/old-ads-media.txt" || true) $(cat "$WORK/prepare-summary.txt" 2>/dev/null || true)"
}

copy_all() {
  echo "== $(date -Is) بدء النقل"
  # القديم أولاً ثم الحالي: عند تطابق المسار يبقى ملف الموقع الحالي، كما يفعل الموقع اليوم.
  "${RC[@]}" copy "$LEGACY" "$REMOTE" --transfers 8 --checkers 16 --stats 60s --stats-one-line -v
  "${RC[@]}" copy "$STORAGE" "$REMOTE" --transfers 8 --checkers 16 --stats 60s --stats-one-line -v
  echo "== $(date -Is) COPY_DONE"
}

verify() {
  local bad=0
  # 1) كل ملف في تخزين الموقع الحالي موجود في المخزن بنفس الحجم.
  "${RC[@]}" check "$STORAGE" "$REMOTE" --one-way --size-only --missing-on-dst "$WORK/storage-missing.txt" --differ "$WORK/storage-differ.txt" >/dev/null 2>&1 || true
  # 2) كل ملف في الموقع القديم موجود في المخزن؛ اختلاف الحجم مقبول فقط إن كان المسار نفسه
  #    موجوداً في تخزين الموقع الحالي (فهو المعروض اليوم).
  "${RC[@]}" check "$LEGACY" "$REMOTE" --one-way --size-only --missing-on-dst "$WORK/legacy-missing.txt" --differ "$WORK/legacy-differ.txt" >/dev/null 2>&1 || true
  : > "$WORK/legacy-differ-real.txt"
  while IFS= read -r f; do [[ -n "$f" && ! -f "$STORAGE/$f" ]] && echo "$f" >> "$WORK/legacy-differ-real.txt"; done < "$WORK/legacy-differ.txt"
  for f in storage-missing storage-differ legacy-missing legacy-differ-real; do
    n=$(grep -c . "$WORK/$f.txt" 2>/dev/null || true); echo "$f=${n:-0}"; [[ "${n:-0}" -eq 0 ]] || bad=1
  done
  echo "LOCAL_STORAGE: $("${RC[@]}" size "$STORAGE" 2>/dev/null | tr '\n' ' ')"
  echo "LOCAL_LEGACY:  $("${RC[@]}" size "$LEGACY" 2>/dev/null | tr '\n' ' ')"
  echo "R2_BUCKET:     $(rclone --bind "$BIND" size "$REMOTE" 2>/dev/null | tr '\n' ' ')"
  [[ $bad -eq 0 ]] && echo "VERIFY_OK: كل الوسائط موجودة في المخزن" || { echo "VERIFY_FAIL: راجع الملفات في $WORK"; exit 1; }
}

# تحقق على مستوى الإعلان: كل صورة وفيديو لإعلان منقول (من قاعدة البيانات) موجود في المخزن.
verify_ads() {
  docker exec -i -e DAYS="$DAYS" -e PUBLISHED_ONLY="${TRBHH_PUBLISHED_ONLY:-1}" -e MODE=keep -w /app trbhh-app node - < "$HERE/old-ads-media.cjs" 2> "$WORK/ads-summary.txt" | sort -u > "$WORK/ads-media.txt"
  rclone --bind "$BIND" lsf -R --files-only "$REMOTE" | sort -u > "$WORK/bucket-files.txt"
  comm -23 "$WORK/ads-media.txt" "$WORK/bucket-files.txt" > "$WORK/ads-media-missing.txt"
  local miss; miss=$(grep -c . "$WORK/ads-media-missing.txt" || true)
  echo "$(cat "$WORK/ads-summary.txt") in_bucket=$(( $(grep -c . "$WORK/ads-media.txt" || true) - miss )) missing=$miss"
  if [[ "$miss" -eq 0 ]]; then echo "ADS_OK: كل وسائط الإعلانات المنقولة موجودة في المخزن"
  else echo "ADS_MISSING: أول الملفات الناقصة:"; head -10 "$WORK/ads-media-missing.txt"; for f in $(head -3 "$WORK/ads-media-missing.txt"); do [[ -f "$STORAGE/$f" || -f "$LEGACY/$f" ]] && echo "  موجود على Hostinger: $f" || echo "  غير موجود على Hostinger أصلاً: $f"; done; exit 1; fi
}

case "${1:-}" in
  start)
    if pgrep -f "media-to-r2.sh run" >/dev/null; then echo "النقل يعمل بالفعل. استخدم: status"; exit 0; fi
    prepare
    nohup bash "$0" run >> "$LOG" 2>&1 &
    echo "بدأ النقل في الخلفية. للمتابعة: bash $0 status" ;;
  run) [[ -s "$FILTER" ]] || prepare; copy_all ;;
  status)
    pgrep -f "media-to-r2.sh run" >/dev/null && echo "الحالة: يعمل" || echo "الحالة: متوقف"
    grep -E "COPY_DONE|ERROR|Failed" "$LOG" 2>/dev/null | tail -5 || true
    tail -n 3 "$LOG" 2>/dev/null || true ;;
  prepare) prepare ;;
  verify-ads) verify_ads ;;
  verify) [[ -s "$FILTER" ]] || prepare; verify ;;
  *) echo "الاستعمال: $0 start|status|verify|verify-ads|prepare" >&2; exit 2 ;;
esac
