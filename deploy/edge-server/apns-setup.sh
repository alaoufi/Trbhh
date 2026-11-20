#!/usr/bin/env bash
# ضبط مفتاح إشعارات iPhone (APNs) لـ«تربح» على الخادم المشترك. يمس /etc/trbhh وحاوية trbhh-app فقط.
#   bash apns-setup.sh <KEY_ID> <TEAM_ID> <BUNDLE_ID>
# قبله ينسخ المالك الملف بـ scp إلى /etc/trbhh/AuthKey_<KEY_ID>.p8
# ماذا يفعل: يتأكد أنه مفتاح P-256، يحفظ القيم في /etc/trbhh/app.env دون طباعتها، يعيد تشغيل التطبيق،
# يسأل Apple فعلاً من داخل الحاوية، ثم يحذف نسخة الملف. إن رفضت Apple المفتاح يُرجع ملف البيئة كما كان.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
kid="${1:-}"; team="${2:-}"; bundle="${3:-}"
[[ "$kid" =~ ^[A-Z0-9]{10}$ && "$team" =~ ^[A-Z0-9]{10}$ && "$bundle" =~ ^[A-Za-z0-9.-]{3,155}$ ]] || { echo "الاستعمال: $0 <KEY_ID> <TEAM_ID> <BUNDLE_ID>" >&2; exit 2; }
umask 077
ENVF=/etc/trbhh/app.env
P8="/etc/trbhh/AuthKey_${kid}.p8"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE=(docker compose -f "$HERE/compose.yml")
[[ -f "$ENVF" ]] || { echo "APNS_FAIL: $ENVF غير موجود" >&2; exit 1; }
[[ -f "$P8" ]] || { echo "APNS_FAIL: الملف $P8 غير موجود — انسخه أولاً بـ scp" >&2; exit 1; }
openssl pkey -in "$P8" -noout -text 2>/dev/null | grep -q 'prime256v1\|P-256' || { echo "APNS_FAIL: الملف ليس مفتاح P-256" >&2; exit 1; }
commit="$(cat /srv/trbhh/release-current 2>/dev/null || true)"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "APNS_FAIL: لا نسخة منشورة بعد — شغّل release.sh أولاً" >&2; exit 1; }

restart() { TRBHH_RELEASE_COMMIT="$commit" "${COMPOSE[@]}" up -d --no-build --force-recreate app >/dev/null 2>&1; }
wait_up() { local i; for i in $(seq 1 60); do curl -fsS --max-time 5 -o /dev/null -H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8101/api/version 2>/dev/null && return 0; sleep 2; done; return 1; }

BAK="$(mktemp /etc/trbhh/app.env.apns.XXXXXX)"
cp -p "$ENVF" "$BAK"
grep -v -E '^APNS_(KEY_ID|TEAM_ID|BUNDLE_ID|KEY)=' "$BAK" > "$ENVF" || true
{ echo "APNS_KEY_ID=$kid"; echo "APNS_TEAM_ID=$team"; echo "APNS_BUNDLE_ID=$bundle"; echo "APNS_KEY=$(base64 -w0 "$P8")"; } >> "$ENVF"
chmod 600 "$ENVF"

restart; wait_up || { cp -p "$BAK" "$ENVF"; restart; rm -f "$BAK"; echo "APNS_FAIL: التطبيق لم يعد بعد إعادة التشغيل — أُرجع ملف البيئة" >&2; exit 1; }
if out="$(docker exec -i trbhh-app node - < "$HERE/apns-check.cjs" 2>&1)"; then
  echo "$out"
  rm -f "$P8" "$BAK"
  echo "APNS_SETUP_OK — حُذف $P8 من الخادم. الأصل يبقى عندك في مدير كلمات المرور."
else
  echo "$out"
  cp -p "$BAK" "$ENVF"; rm -f "$BAK"; restart; wait_up || true
  echo "APNS_SETUP_FAILED — أُرجع ملف البيئة كما كان، وملف المفتاح باقٍ في مكانه" >&2; exit 1
fi
