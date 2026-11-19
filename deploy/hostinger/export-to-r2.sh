#!/usr/bin/env bash
# تصدير قاعدة بيانات «تربح» وملف الأسرار (.env) من Hostinger إلى الخادم الجديد عبر R2، مشفّرَين
# بالمفتاح العام للخادم الجديد: لا يفكّهما إلا الخادم الجديد، ولا يمر أي سر بالمحادثة.
# قراءة فقط على Hostinger: لا يغيّر القاعدة ولا الموقع. المؤقت يُحذف في النهاية.
#   bash deploy/hostinger/export-to-r2.sh
set -euo pipefail
umask 077
REMOTE="${TRBHH_R2_REMOTE:-trbhh-media:trbhh-media}"
ENV_FILE=/root/trbhh/.env
WORK="$(mktemp -d /root/trbhh-export.XXXXXX)"; trap 'rm -rf "$WORK"' EXIT
pub="$(curl -4 -s --max-time 10 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' || true)"
if [[ "$pub" =~ ^[0-9.]+$ ]] && ip -4 -o addr 2>/dev/null | grep -qw "$pub"; then BIND="$pub"; else BIND=0.0.0.0; fi
RC=(rclone --bind "$BIND" --s3-no-check-bucket)

"${RC[@]}" copyto "$REMOTE/_migration/migrate.pub" "$WORK/pub.pem"
echo "public key fingerprint=$(sha256sum "$WORK/pub.pem" | cut -c1-16)"

# بيانات الاتصال من DATABASE_URL إلى ملف إعداد مؤقت (لا تظهر في قائمة العمليات ولا تُطبع).
python3 - "$ENV_FILE" "$WORK/my.cnf" "$WORK/dbname" <<'PY'
import re, sys
from urllib.parse import urlparse, unquote
url = None
for line in open(sys.argv[1], encoding='utf-8'):
    m = re.match(r'\s*DATABASE_URL\s*=\s*(.*)$', line)
    if m: url = m.group(1).strip().strip('"').strip("'")
if not url: sys.exit('DATABASE_URL غير موجود في .env')
u = urlparse(url)
host = '127.0.0.1' if u.hostname in ('host.docker.internal', 'localhost') else u.hostname
esc = lambda v: v.replace('\\', '\\\\').replace('"', '\\"')
open(sys.argv[2], 'w').write('[client]\nuser="%s"\npassword="%s"\nhost=%s\nport=%s\n' % (esc(unquote(u.username or '')), esc(unquote(u.password or '')), host, u.port or 3306))
open(sys.argv[3], 'w').write(u.path.lstrip('/').split('?')[0])
PY
DB="$(cat "$WORK/dbname")"
dump() { mysqldump --defaults-extra-file="$WORK/my.cnf" --single-transaction --quick --triggers --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 --hex-blob "$@" "$DB"; }
strip_definer() { sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g'; }
# الإجراءات والأحداث تحتاج صلاحيات قد لا يملكها مستخدم التطبيق: نجرّب بها ثم بدونها.
if dump --routines --events 2>"$WORK/dump.err" | strip_definer | gzip -6 > "$WORK/database.sql.gz"; then echo "dump: with routines and events"
elif dump 2>"$WORK/dump.err" | strip_definer | gzip -6 > "$WORK/database.sql.gz"; then echo "dump: tables, views and triggers (no routines/events privilege)"
else echo "EXPORT_FAIL: $(tail -2 "$WORK/dump.err")" >&2; exit 1; fi
zcat "$WORK/database.sql.gz" | tail -1 | grep -q 'Dump completed' || { echo "EXPORT_FAIL: التفريغ لم يكتمل" >&2; exit 1; }
mysql --defaults-extra-file="$WORK/my.cnf" -N -B "$DB" -e "SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'; SELECT CONCAT('ads=', COUNT(*)) FROM ads; SELECT CONCAT('users=', COUNT(*)) FROM users; SELECT CONCAT('settings=', COUNT(*)) FROM site_settings;" > "$WORK/counts.txt"
cp "$ENV_FILE" "$WORK/hostinger.env"

tar -C "$WORK" -cf "$WORK/export.tar" database.sql.gz hostinger.env counts.txt
sha="$(sha256sum "$WORK/export.tar" | cut -d' ' -f1)"
openssl rand -hex 32 > "$WORK/aes.key"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$WORK/export.tar" -out "$WORK/export.tar.enc" -pass "file:$WORK/aes.key"
printf '%s %s\n' "$(cat "$WORK/aes.key")" "$sha" > "$WORK/keyblob"
openssl pkeyutl -encrypt -pubin -inkey "$WORK/pub.pem" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$WORK/keyblob" -out "$WORK/export.key.enc"
"${RC[@]}" copyto "$WORK/export.tar.enc" "$REMOTE/_migration/export.tar.enc"
"${RC[@]}" copyto "$WORK/export.key.enc" "$REMOTE/_migration/export.key.enc"
echo "EXPORT_OK bytes=$(stat -c %s "$WORK/export.tar.enc") $(tr '\n' ' ' < "$WORK/counts.txt")"
