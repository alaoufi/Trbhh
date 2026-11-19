#!/usr/bin/env bash
# اختبار استرجاع فعلي لآخر نسخة: تنزيل، فك تشفير، مطابقة SHA256SUMS، قراءة التفريغ، استنساخ الكود.
# لا يمسّ قاعدة البيانات الحية ولا الكود الحي. المؤقت يُحذف في النهاية.
set -euo pipefail
umask 077
REMOTE="${TRBHH_BACKUP_REMOTE:-trbhh-backups:trbhh-backups}"
KEY=/etc/trbhh/backup.key
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
WORK="$(mktemp -d /srv/trbhh/tmp/verify.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
LATEST="$(rclone --config /etc/trbhh/rclone.conf --bind "$BIND" lsf "$REMOTE/daily/" | sort | tail -1)"
[[ -n "$LATEST" ]] || { echo "VERIFY_FAIL: لا توجد نسخ" >&2; exit 1; }
rclone --config /etc/trbhh/rclone.conf --bind "$BIND" copyto "$REMOTE/daily/$LATEST" "$WORK/b.tar.gpg"
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-file "$KEY" "$WORK/b.tar.gpg" | tar -C "$WORK" -xf -
D="$(find "$WORK" -maxdepth 1 -type d -name 'trbhh-*' | head -1)"
( cd "$D" && sha256sum --quiet -c SHA256SUMS )
TABLES=$(zcat "$D/database.sql.gz" | grep -c '^CREATE TABLE')
ROWS=$(zcat "$D/database.sql.gz" | grep -c '^INSERT INTO')
SCHEMA=$(grep -c '^CREATE TABLE' "$D/database-schema.sql")
git clone -q "$D/code.bundle" "$WORK/code" && COMMIT=$(git -C "$WORK/code" rev-parse --short HEAD)
[[ "$TABLES" -gt 50 && "$SCHEMA" -eq "$TABLES" && -n "$COMMIT" ]] || { echo "VERIFY_FAIL tables=$TABLES schema=$SCHEMA" >&2; exit 1; }
echo "VERIFY_OK file=$LATEST tables=$TABLES insert_statements=$ROWS code_commit=$COMMIT etc_files=$(tar -tzf "$D/etc-trbhh.tar.gz" | grep -vc '/$')"
