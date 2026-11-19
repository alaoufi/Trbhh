#!/usr/bin/env bash
# نسخة احتياطية يومية مشفّرة لـ«تربح» إلى مخزن R2 (trbhh-backups).
# المحتوى: قاعدة البيانات كاملة + توصيفها (المخطط وحده) + الكود كاملاً بتاريخه (git bundle --all)
# + ملفات الخادم خارج Git + أسرار /etc/trbhh (عدا مفتاح التشفير نفسه) + SHA256SUMS.
# لا تبقى نسخة على الخادم: الملف المؤقت يُحذف بعد الرفع. لا يطبع أي سر.
set -euo pipefail
umask 077
REMOTE="${TRBHH_BACKUP_REMOTE:-trbhh-backups:trbhh-backups}"
KEY=/etc/trbhh/backup.key
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
WORK="$(mktemp -d /srv/trbhh/tmp/backup.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
[[ -s "$KEY" ]] || { echo "مفتاح التشفير غير موجود: $KEY" >&2; exit 2; }
# shellcheck disable=SC1091
. /etc/trbhh/db.env
D="$WORK/trbhh-$STAMP"; mkdir -p "$D"

dump() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysqldump -uroot --single-transaction --quick --routines --triggers --events --default-character-set=utf8mb4 --no-tablespaces "$@"; }
dump "$MYSQL_DATABASE" | gzip -6 > "$D/database.sql.gz"
dump --no-data "$MYSQL_DATABASE" > "$D/database-schema.sql"
git -C /opt/trbhh bundle create "$D/code.bundle" --all >/dev/null 2>&1
git -C /opt/trbhh rev-parse HEAD > "$D/code-commit.txt"
# ملفات داخل /opt/trbhh غير متتبَّعة في Git (إن وجدت)، بلا node_modules ومخرجات البناء.
( cd /opt/trbhh && git ls-files --others --exclude-standard -z | tar --null -T - -czf "$D/untracked-files.tar.gz" 2>/dev/null ) || true
tar -C /etc -czf "$D/etc-trbhh.tar.gz" --exclude='trbhh/backup.key' --exclude='trbhh/ci' trbhh
( cd "$D" && sha256sum -- * > SHA256SUMS )

OUT="$WORK/trbhh-$STAMP.tar.gpg"
tar -C "$WORK" -cf - "trbhh-$STAMP" | gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-file "$KEY" -o "$OUT"
rclone --config /etc/trbhh/rclone.conf --bind "$BIND" --s3-no-check-bucket copyto "$OUT" "$REMOTE/daily/trbhh-$STAMP.tar.gpg"
SIZE=$(stat -c %s "$OUT")
REMOTE_SIZE=$(rclone --config /etc/trbhh/rclone.conf --bind "$BIND" lsf --format s "$REMOTE/daily/trbhh-$STAMP.tar.gpg")
[[ "$SIZE" == "$REMOTE_SIZE" ]] || { echo "BACKUP_FAIL: حجم الملف في المخزن لا يطابق" >&2; exit 1; }
echo "BACKUP_OK daily/trbhh-$STAMP.tar.gpg bytes=$SIZE"
