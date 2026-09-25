#!/usr/bin/env bash
# تنبيه استخدام القرص عند 70% / 80% / 90%. للتشغيل عبر cron كل 10 دقائق.
#   */10 * * * * /bin/bash /root/trbhh/ops/vps-disk-alert.sh
# يكتب في syslog، وإن ضُبط TRBHH_ALERT_WEBHOOK يرسل تنبيهاً (Slack/Discord/Telegram-compatible).
set -Eeuo pipefail
USE=$(df --output=pcent / 2>/dev/null | tr -dc '0-9')
[[ -z "$USE" ]] && exit 0
level=""
if   (( USE >= 90 )); then level="حرِج ⛔ (${USE}%)"
elif (( USE >= 80 )); then level="مرتفع ⚠️ (${USE}%)"
elif (( USE >= 70 )); then level="تنبيه ℹ️ (${USE}%)"
fi
[[ -z "$level" ]] && exit 0
MSG="Trbhh VPS: استخدام القرص $level — نفّذ ops/vps-backup-retention.sh أو راجع ops/vps-disk-cleanup.sh"
logger -t trbhh-disk "$MSG" 2>/dev/null || true
echo "$MSG"
if [[ -n "${TRBHH_ALERT_WEBHOOK:-}" ]]; then
  curl -fsS -m 10 -H 'Content-Type: application/json' \
    -d "$(printf '{"text":"%s","content":"%s"}' "$MSG" "$MSG")" \
    "$TRBHH_ALERT_WEBHOOK" >/dev/null 2>&1 || true
fi
