#!/usr/bin/env bash
# المزامنة الأخيرة من Hostinger قبل تحويل DNS: ينقل ما استجدّ من الوسائط إلى R2 ويتحقق منه، ثم
# يصدّر قاعدة البيانات والأسرار مشفّرة. قراءة فقط على Hostinger.
#   bash deploy/hostinger/final-sync.sh           مزامنة والموقع القديم يعمل
#   bash deploy/hostinger/final-sync.sh --freeze  يوقف تطبيق الموقع القديم أولاً فلا تُكتب بيانات
#                                                 جديدة بعد التصدير (القاعدة والخادم يبقيان كما هما؛
#                                                 للإرجاع: docker compose start app)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
sync_media() {
  bash "$HERE/media-to-r2.sh" run 2>&1 | grep -E "COPY_DONE|Transferred:|ERROR.*Attempt [0-9]/3 failed" | tail -6 || true
  bash "$HERE/media-to-r2.sh" verify
}
# قائمة الإعلانات تُبنى والتطبيق يعمل (تُقرأ من داخل حاويته)، ثم تُنقل الوسائط.
bash "$HERE/media-to-r2.sh" prepare
sync_media
if [[ "${1:-}" == "--freeze" ]]; then
  ( cd /root/trbhh && docker compose stop app )
  echo "FROZEN: تطبيق الموقع القديم متوقف (للإرجاع: cd /root/trbhh && docker compose start app)"
  sync_media # ما رُفع في الثواني الأخيرة قبل الإيقاف
fi
bash "$HERE/export-to-r2.sh" 2>&1 | grep -v -E "NotImplemented|status code: 501|Attempt ./3 succeeded"
echo "FINAL_SYNC_OK $(date -u +%FT%TZ)"
