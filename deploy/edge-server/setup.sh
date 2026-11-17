#!/usr/bin/env bash
# تجهيز موارد «تربح» على الخادم المشترك — يمسّ موارد trbhh فقط ويرفض غيرها.
# آمن لإعادة التشغيل: لا يستبدل ملف أسرار موجوداً ولا يحذف شيئاً، ولا يطبع أي سر.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
umask 077
install -d -m 755 /opt/trbhh
install -d -m 700 /srv/trbhh /srv/trbhh/mysql /srv/trbhh/tmp /etc/trbhh

# المنفذ 8101 محجوز لتربح: إن كان مشغولاً بغير حاوية trbhh-app نتوقف.
if ss -ltn | grep -q '127.0.0.1:8101 ' && ! docker ps --format '{{.Names}}' | grep -qx trbhh-app; then
  echo "المنفذ 127.0.0.1:8101 مشغول بغير تربح — توقف." >&2; exit 3
fi

rand() { openssl rand -hex "$1"; }
if [[ ! -f /etc/trbhh/db.env ]]; then
  printf 'MYSQL_ROOT_PASSWORD=%s\nMYSQL_DATABASE=trbhhdb\nMYSQL_USER=trbhh\nMYSQL_PASSWORD=%s\n' "$(rand 24)" "$(rand 24)" > /etc/trbhh/db.env
  echo "أُنشئ /etc/trbhh/db.env"
else echo "/etc/trbhh/db.env موجود — لم يُغيَّر"; fi

if [[ ! -f /etc/trbhh/app.env ]]; then
  # shellcheck disable=SC1091
  . /etc/trbhh/db.env
  {
    echo "DATABASE_URL=mysql://trbhh:${MYSQL_PASSWORD}@db:3306/trbhhdb"
    echo "# AUTH_SECRET وبقية أسرار التطبيق تُنقل من ملف .env على Hostinger (خطوة مستقلة) — لا تولَّد هنا"
    echo "# حتى تبقى الجلسات والتحقق الثنائي والأسرار المشفّرة صالحة بعد النقل."
    echo "R2_ACCOUNT_ID="
    echo "R2_ACCESS_KEY_ID="
    echo "R2_SECRET_ACCESS_KEY="
    echo "R2_MEDIA_BUCKET=trbhh-media"
  } > /etc/trbhh/app.env
  echo "أُنشئ /etc/trbhh/app.env (ناقص: أسرار التطبيق ومفتاح R2)"
else echo "/etc/trbhh/app.env موجود — لم يُغيَّر"; fi

# مفتاح قراءة فقط لسحب الكود من GitHub (Deploy key) — يُضاف مفتاحه العام في إعدادات المستودع.
if [[ ! -f /etc/trbhh/deploy_key ]]; then
  ssh-keygen -q -t ed25519 -N '' -C 'trbhh-deploy@shared-server' -f /etc/trbhh/deploy_key
fi
chmod 600 /etc/trbhh/*.env /etc/trbhh/deploy_key
chmod 700 /etc/trbhh
echo "---- المفتاح العام (ليس سراً) — أضفه في GitHub ← Deploy keys بلا صلاحية كتابة:"
cat /etc/trbhh/deploy_key.pub
echo "SETUP_OK"
