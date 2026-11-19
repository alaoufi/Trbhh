#!/usr/bin/env bash
# فحص «تربح» على الخادم الجديد قبل DNS (قراءة فقط): الإصدار، الصفحات، عرض الصور والفيديو من R2،
# وأن كل صورة وفيديو لكل إعلان في القاعدة موجود في المخزن. يتصل بـ127.0.0.1:8101 مباشرة.
set -uo pipefail
export PATH="/srv/trbhh/bin:$PATH"
# shellcheck disable=SC1091
. /etc/trbhh/db.env
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
BASE=http://127.0.0.1:8101
H=(-H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https')
fail=0
ok() { echo "OK    $*"; }
bad() { echo "FAIL  $*"; fail=1; }
my() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot --default-character-set=utf8mb4 -N -B "$MYSQL_DATABASE" -e "$1"; }
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }
get() { curl -s -o /dev/null --max-time 30 "${H[@]}" -w '%{http_code} %{content_type} %{size_download} %{time_total}' "$@"; }

v="$(curl -s --max-time 10 "${H[@]}" "$BASE/api/version")"
[[ "$v" == *"$(git -C /opt/trbhh rev-parse HEAD)"* ]] && ok "version $v" || bad "version: $v (المتوقع $(git -C /opt/trbhh rev-parse --short HEAD))"

ad="$(my "SELECT id FROM ads WHERE status=1 ORDER BY id DESC LIMIT 1")"
for path in / /search "/ads/$ad" /login /guide; do
  r="$(get "$BASE$path")"; [[ "$r" == 200* ]] && ok "page $path -> $r" || bad "page $path -> $r"
done

FILES="SELECT u.file_name FROM photos ph JOIN ads a ON a.id=ph.other_id JOIN uploads u ON u.id=CAST(ph.photo_path AS UNSIGNED) WHERE u.file_name IS NOT NULL AND u.file_name<>''"
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  r="$(get "$BASE/media/$(enc "$f")")"; [[ "$r" == "200 image/"* ]] && ok "image via R2 $f -> $r" || bad "image $f -> $r"
done < <(my "$FILES ORDER BY RAND() LIMIT 5")

vid="$(my "SELECT video_path FROM ads WHERE status=1 AND video_path LIKE 'uploads/%' ORDER BY id DESC LIMIT 1")"
if [[ -n "$vid" ]]; then
  r="$(get -r 0-1023 "$BASE/media/$(enc "$vid")")"; [[ "$r" == "206 video/"* ]] && ok "video range via R2 -> $r" || bad "video $vid -> $r"
else echo "SKIP  لا إعلان منشور بفيديو حديث للتجربة"; fi

r="$(get "$BASE/media/backups/x.sql")"; [[ "$r" == 404* ]] && ok "backups not served -> 404" || bad "backups path -> $r"

work="$(mktemp -d /srv/trbhh/tmp/selftest.XXXXXX)"; trap 'rm -rf "$work"' EXIT
{ my "$FILES"; my "SELECT video_path FROM ads WHERE video_path LIKE '%/%'"; my "SELECT u.file_name FROM ads a JOIN uploads u ON u.id=CAST(a.video_path AS UNSIGNED) WHERE a.video_path REGEXP '^[0-9]+\$' AND a.video_path<>'0'"; } | sed 's|^/*||' | sort -u > "$work/db.txt"
rclone --config /etc/trbhh/rclone.conf --bind "$BIND" lsf -R --files-only trbhh-media:trbhh-media | sort -u > "$work/bucket.txt"
miss="$(comm -23 "$work/db.txt" "$work/bucket.txt" | grep -c . || true)"
total="$(grep -c . "$work/db.txt" || true)"
if [[ "$miss" -eq 0 ]]; then ok "ad media in R2: $total/$total (ads=$(my 'SELECT COUNT(*) FROM ads'))"
else
  # ملف مذكور في القاعدة وغير موجود في المخزن: خلل نقل إن كان الموقع القديم يعرضه، وإلا فهو
  # مرجع معطوب قديم (مثل مسارات tmp/php من الموقع السابق) لا يعرضه القديم أيضاً.
  real=0
  while IFS= read -r f; do
    code="$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "https://trbhh.sa/media/$(enc "$f")")"
    if [[ "$code" == 200 || "$code" == 206 ]]; then bad "missing in R2 but served by the old site: $f"; real=1
    else echo "WARN  مرجع معطوب في القديم أيضاً ($code): $f"; fi
  done < <(comm -23 "$work/db.txt" "$work/bucket.txt")
  [[ $real -eq 0 ]] && ok "ad media in R2: $((total-miss))/$total (+$miss مرجعاً معطوباً في الموقع القديم نفسه)"
fi

echo "containers: $(docker ps --format '{{.Names}}={{.Status}}' | grep '^trbhh-' | tr '\n' ' ')"
echo "ports: $(docker ps --format '{{.Names}} {{.Ports}}' | grep '^trbhh-' | tr '\n' ';')"
[[ $fail -eq 0 ]] && echo "SELFTEST_OK" || { echo "SELFTEST_FAIL"; exit 1; }
