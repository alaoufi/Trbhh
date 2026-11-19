#!/usr/bin/env bash
# نسخة احتياطية كاملة مشفّرة لـ«تربح» إلى مخزن R2 (trbhh-backups).
#   bash backup.sh daily    (الافتراضي، من cron يومياً)
#   bash backup.sh manual   (عند «خذ نسخة الآن» من لوحة الإدارة، عبر backup-watch.sh)
# المحتوى: قاعدة البيانات كاملة + توصيفها (المخطط وحده) + الكود كاملاً بتاريخه (git bundle --all)
# + ملفات الخادم خارج Git + أسرار /etc/trbhh (عدا مفتاح التشفير ومفاتيح النشر) + SHA256SUMS.
# مع كل نسخة ملف وصف صغير (json) غير مشفّر تعرضه لوحة الإدارة: لا أسرار فيه.
# لا تبقى نسخة على الخادم: المؤقت يُحذف بعد الرفع. لا يطبع أي سر. نتيجة كل تشغيل تُسجَّل في
# إعدادات الموقع (backup_last_*) لتظهر في لوحة الإدارة.
set -euo pipefail
export PATH="/srv/trbhh/bin:$PATH" # rclone الخاص بتربح
umask 077
KIND="${1:-daily}"
[[ "$KIND" == daily || "$KIND" == manual ]] || { echo "الاستعمال: $0 daily|manual" >&2; exit 2; }
REMOTE="${TRBHH_BACKUP_REMOTE:-trbhh-backups:trbhh-backups}"
KEY=/etc/trbhh/backup.key
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
RC=(rclone --config /etc/trbhh/rclone.conf --bind "$BIND" --s3-no-check-bucket)
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
# shellcheck disable=SC1091
. /etc/trbhh/db.env
my() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot --default-character-set=utf8mb4 -N -B "$MYSQL_DATABASE"; }
setting() { printf "INSERT INTO site_settings (k, v) VALUES ('%s', '%s') ON DUPLICATE KEY UPDATE v = VALUES(v);\n" "$1" "${2//\'/}" | my >/dev/null 2>&1 || true; }
exec 9> /run/trbhh-backup.lock
flock -n 9 || { echo "نسخة أخرى تعمل الآن"; exit 3; }
WORK="$(mktemp -d /srv/trbhh/tmp/backup.XXXXXX)"
finish() { local code=$?; rm -rf "$WORK"; if [[ $code -ne 0 ]]; then setting backup_last_status "فشلت (رمز $code)"; setting backup_last_at "$(date -u +%FT%T.000Z)"; fi; }
trap finish EXIT
[[ -s "$KEY" ]] || { echo "مفتاح التشفير غير موجود: $KEY" >&2; exit 2; }
D="$WORK/trbhh-$STAMP"; mkdir -p "$D"

dump() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysqldump -uroot --single-transaction --quick --routines --triggers --events --default-character-set=utf8mb4 --no-tablespaces "$@"; }
dump "$MYSQL_DATABASE" | gzip -6 > "$D/database.sql.gz"
dump --no-data "$MYSQL_DATABASE" > "$D/database-schema.sql"
git -C /opt/trbhh bundle create "$D/code.bundle" --all >/dev/null 2>&1
COMMIT="$(git -C /opt/trbhh rev-parse HEAD)"; echo "$COMMIT" > "$D/code-commit.txt"
# ملفات داخل /opt/trbhh غير متتبَّعة في Git (إن وجدت).
( cd /opt/trbhh && git ls-files --others --exclude-standard -z | tar --null -T - -czf "$D/untracked-files.tar.gz" 2>/dev/null ) || true
tar -C /etc -czf "$D/etc-trbhh.tar.gz" --exclude='trbhh/backup.key' --exclude='trbhh/ci' --exclude='trbhh/migrate.key' trbhh
( cd "$D" && sha256sum -- * > SHA256SUMS )
TABLES="$(grep -c '^CREATE TABLE' "$D/database-schema.sql" || true)"
SECRETS="$(tar -tzf "$D/etc-trbhh.tar.gz" | grep -vc '/$' || true)"

OUT="$WORK/trbhh-$STAMP.tar.gpg"
tar -C "$WORK" -cf - "trbhh-$STAMP" | gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-file "$KEY" -o "$OUT"
printf '{"kind":"%s","createdAt":"%s","commit":"%s","tables":%s,"databaseBytes":%s,"codeBundleBytes":%s,"secretsFiles":%s,"contents":["database.sql.gz","database-schema.sql","code.bundle","untracked-files.tar.gz","etc-trbhh.tar.gz","SHA256SUMS"]}\n' \
  "$KIND" "$(date -u +%FT%T.000Z)" "$COMMIT" "${TABLES:-0}" "$(stat -c %s "$D/database.sql.gz")" "$(stat -c %s "$D/code.bundle")" "${SECRETS:-0}" > "$WORK/trbhh-$STAMP.json"
"${RC[@]}" copyto "$OUT" "$REMOTE/$KIND/trbhh-$STAMP.tar.gpg"
"${RC[@]}" copyto "$WORK/trbhh-$STAMP.json" "$REMOTE/$KIND/trbhh-$STAMP.json"
SIZE=$(stat -c %s "$OUT")
REMOTE_SIZE=$("${RC[@]}" lsf --format s "$REMOTE/$KIND/trbhh-$STAMP.tar.gpg")
[[ "$SIZE" == "$REMOTE_SIZE" ]] || { echo "BACKUP_FAIL: حجم الملف في المخزن لا يطابق" >&2; exit 1; }
setting backup_last_name "$KIND/trbhh-$STAMP.tar.gpg"
setting backup_last_status ok
setting backup_last_at "$(date -u +%FT%T.000Z)"
echo "BACKUP_OK $KIND/trbhh-$STAMP.tar.gpg bytes=$SIZE tables=$TABLES"
