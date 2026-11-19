#!/usr/bin/env bash
# تشغيل «تربح» على الخادم الجديد بأمر واحد، خطوة بعد خطوة، ويتوقف عند أول فشل:
#   1. استيراد القاعدة والأسرار من ملف Hostinger المشفّر في R2 (يُتجاوز إن كانت القاعدة مستوردة)
#   2. إزالة الإعلانات غير المنقولة (قرار المالك: المنشورة من آخر 90 يوماً فقط). قاعدة Hostinger
#      والملف المشفّر في R2 يبقيان كاملين.
#   3. بناء التطبيق وتشغيله على 127.0.0.1:8101 مع التحقق والرجوع التلقائي
#   4. الفحص الذاتي
# لا يغيّر البوابة ولا DNS ولا يمس أي موقع آخر. آمن لإعادة التشغيل.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
D=/opt/trbhh/deploy/edge-server
# shellcheck disable=SC1091
. /etc/trbhh/db.env
step() { echo; echo "=== $* ==="; }

step "1/4 قاعدة البيانات والأسرار"
rm -rf /srv/trbhh/tmp/import.* # مؤقت الاستيراد (تفريغ وأسرار مفكوكة) لا يبقى على القرص
tables=0
if docker inspect trbhh-db >/dev/null 2>&1; then
  tables="$(docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" trbhh-db mysql -uroot -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$MYSQL_DATABASE'" 2>/dev/null || echo 0)"
fi
if [[ "$tables" -gt 0 ]]; then echo "القاعدة مستوردة سابقاً ($tables جدولاً) — تُتجاوز"; else bash "$D/migrate.sh" import; fi

step "2/4 الإعلانات المنقولة فقط"
# مرة واحدة فقط عند النقل: بعد فتح الموقع لا تُزال إعلانات الأعضاء بمرور الوقت.
if [[ -f /srv/trbhh/prune-done ]]; then echo "أُزيلت سابقاً ($(cat /srv/trbhh/prune-done)) — تُتجاوز"
else bash "$D/prune-ads.sh" apply --yes && date -u +%FT%TZ > /srv/trbhh/prune-done; fi

step "3/4 بناء التطبيق وتشغيله (عدة دقائق)"
bash "$D/release.sh"

step "4/4 الفحص الذاتي"
bash "$D/selftest.sh"
echo
echo "BRING_UP_OK"
