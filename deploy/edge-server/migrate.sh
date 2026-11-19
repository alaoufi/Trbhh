#!/usr/bin/env bash
# استقبال قاعدة البيانات والأسرار من Hostinger على الخادم الجديد (عبر R2، مشفّرة لهذا الخادم فقط).
#   bash migrate.sh init               ينشئ زوج مفاتيح الاستقبال ويرفع المفتاح العام إلى المخزن
#   bash migrate.sh import             ينزّل ويفك التشفير ويستورد القاعدة في trbhh-db ويضبط الأسرار
#   bash migrate.sh import --replace   كالسابق لكن يستبدل قاعدة موجودة (لإعادة المزامنة قبل التحويل)
# يمس موارد trbhh فقط. لا يطبع أي سر. الملفات المؤقتة تُحذف في النهاية.
set -euo pipefail
export PATH="/srv/trbhh/bin:$PATH"
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
umask 077
REMOTE=trbhh-media:trbhh-media
KEY=/etc/trbhh/migrate.key
BIND="$(cat /etc/trbhh/rclone-bind 2>/dev/null || echo 0.0.0.0)"
RC=(rclone --config /etc/trbhh/rclone.conf --bind "$BIND" --s3-no-check-bucket)
COMPOSE=(docker compose -f /opt/trbhh/deploy/edge-server/compose.yml)

init() {
  [[ -f "$KEY" ]] || openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$KEY" 2>/dev/null
  chmod 600 "$KEY"
  local pub; pub="$(mktemp /srv/trbhh/tmp/pub.XXXXXX)"
  openssl pkey -in "$KEY" -pubout -out "$pub"
  "${RC[@]}" copyto "$pub" "$REMOTE/_migration/migrate.pub"
  echo "MIGRATE_INIT_OK fingerprint=$(sha256sum "$pub" | cut -c1-16)"
  rm -f "$pub"
}

import() {
  local replace="${1:-}" WORK; WORK="$(mktemp -d /srv/trbhh/tmp/import.XXXXXX)"; trap 'rm -rf "$WORK"' EXIT
  "${RC[@]}" copyto "$REMOTE/_migration/export.tar.enc" "$WORK/export.tar.enc"
  "${RC[@]}" copyto "$REMOTE/_migration/export.key.enc" "$WORK/export.key.enc"
  openssl pkeyutl -decrypt -inkey "$KEY" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$WORK/export.key.enc" -out "$WORK/keyblob"
  cut -d' ' -f1 "$WORK/keyblob" > "$WORK/aes.key"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$WORK/export.tar.enc" -out "$WORK/export.tar" -pass "file:$WORK/aes.key"
  [[ "$(sha256sum "$WORK/export.tar" | cut -d' ' -f1)" == "$(cut -d' ' -f2 "$WORK/keyblob")" ]] || { echo "IMPORT_FAIL: بصمة الملف لا تطابق" >&2; exit 1; }
  tar -C "$WORK" -xf "$WORK/export.tar"
  echo "source: $(tr '\n' ' ' < "$WORK/counts.txt")"

  # أسرار التطبيق من Hostinger: كل المتغيّرات عدا ما يخص بيئة الخادم القديم. الموجود هنا لا يُستبدل.
  python3 - "$WORK/hostinger.env" /etc/trbhh/app.env <<'PY'
import re, sys
skip = re.compile(r'^(DATABASE_URL|DB_[A-Z_]*|REDIS_URL|STORAGE_DIR|LEGACY_[A-Z_]*|NEXT_PUBLIC_MEDIA_BASE|COOKIE_SECURE|R2_[A-Z_]*|TRBHH_RELEASE_COMMIT|PORT|HOSTNAME|NODE_ENV|TZ|LIBRETRANSLATE_URL)$')
have = {m.group(1) for m in (re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=', l) for l in open(sys.argv[2], encoding='utf-8')) if m}
added = []
with open(sys.argv[2], 'a', encoding='utf-8') as out:
    for line in open(sys.argv[1], encoding='utf-8'):
        m = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$', line.rstrip('\n'))
        if not m or skip.match(m.group(1)) or m.group(1) in have or not m.group(2).strip(): continue
        out.write('%s=%s\n' % (m.group(1), m.group(2).strip())); have.add(m.group(1)); added.append(m.group(1))
print('app.env: added %d variables%s' % (len(added), '' if 'AUTH_SECRET' in have else ' — WARNING: AUTH_SECRET missing'))
PY
  chmod 600 /etc/trbhh/app.env

  # shellcheck disable=SC1091
  . /etc/trbhh/db.env
  "${COMPOSE[@]}" up -d db
  for _ in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' trbhh-db 2>/dev/null)" == healthy ]] && break; sleep 3; done
  [[ "$(docker inspect -f '{{.State.Health.Status}}' trbhh-db)" == healthy ]] || { echo "IMPORT_FAIL: قاعدة البيانات لم تصبح جاهزة" >&2; exit 1; }
  my() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot --default-character-set=utf8mb4 "$@"; }
  local existing; existing="$(my -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$MYSQL_DATABASE'")"
  if [[ "$existing" -gt 0 ]]; then
    [[ "$replace" == "--replace" ]] || { echo "IMPORT_FAIL: القاعدة فيها $existing جدولاً. للاستبدال: bash $0 import --replace" >&2; exit 1; }
    my -e "DROP DATABASE \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
  fi
  zcat "$WORK/database.sql.gz" | my "$MYSQL_DATABASE"
  my -N -B "$MYSQL_DATABASE" -e "SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'; SELECT CONCAT('ads=', COUNT(*)) FROM ads; SELECT CONCAT('users=', COUNT(*)) FROM users; SELECT CONCAT('settings=', COUNT(*)) FROM site_settings;" > "$WORK/imported.txt"
  echo "imported: $(tr '\n' ' ' < "$WORK/imported.txt")"
  diff -q "$WORK/counts.txt" "$WORK/imported.txt" >/dev/null || { echo "IMPORT_FAIL: الأعداد بعد الاستيراد لا تطابق المصدر" >&2; exit 1; }
  echo "IMPORT_OK"
}

case "${1:-}" in
  init) init ;;
  import) import "${2:-}" ;;
  *) echo "الاستعمال: $0 init | import [--replace]" >&2; exit 2 ;;
esac
