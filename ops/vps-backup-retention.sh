#!/usr/bin/env bash
# سياسة احتفاظ دورية لنسخ النشر — تمنع امتلاء القرص. آمنة للتشغيل عبر cron.
# تُبقي أحدث N نسخة احتياطية سليمة، وتحذف دائماً مجلدات *-extracted (نسخ تحقق
# غير مضغوطة)، وتُنظّف كاش البناء والصور المعلّقة ووسوم النشر القديمة.
# لا تلمس: volumes، قاعدة البيانات، .env، الوسائط الحيّة، الصورة الجارية، أحدث النسخ.
#
# تشغيل يدوي:      bash vps-backup-retention.sh
# عبر cron (كل 30 دقيقة):
#   */30 * * * * /bin/bash /root/trbhh/ops/vps-backup-retention.sh >> /var/log/trbhh-retention.log 2>&1
set -Eeuo pipefail

KEEP_BACKUPS=${KEEP_BACKUPS:-3}
KEEP_TOOLS=${KEEP_TOOLS:-3}
PROD=/root/trbhh
BACKUPS=/root/trbhh-release-backups
TOOLS=/root/trbhh-release-tools
ts(){ date '+%F %T'; }
echo "[$(ts)] بدء سياسة الاحتفاظ (keep=$KEEP_BACKUPS)"

# لا تعمل أثناء نشر جارٍ (تفادي حذف نسخة قيد الاستخدام)
if [[ -e "$TOOLS/ACTIVE_DEPLOYMENT" ]]; then
  echo "[$(ts)] يوجد نشر نشِط — تخطّي حذف النسخ، تنظيف extracted فقط."
  ACTIVE_DEPLOY=1
else
  ACTIVE_DEPLOY=0
fi

# (1) احذف دائماً مجلدات *-extracted (نسخ وسائط غير مضغوطة للتحقق فقط)
find "$BACKUPS" -maxdepth 2 -type d -name '*-extracted' -prune 2>/dev/null | while IFS= read -r ex; do
  echo "[$(ts)] حذف extracted: $ex"; rm -rf -- "$ex" || true
done

KEEP_IMG_IDS=""
if [[ "$ACTIVE_DEPLOY" == 0 && -d "$BACKUPS" ]]; then
  # (2) احتفظ بأحدث KEEP_BACKUPS من finance-*، واحذف الأقدم
  idx=0
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    idx=$((idx+1))
    if [[ $idx -le $KEEP_BACKUPS ]]; then
      for f in image-id.txt candidate-image-id.txt; do
        [[ -f "$d/$f" ]] && KEEP_IMG_IDS+=" $(cat "$d/$f" 2>/dev/null || true)"
      done
    else
      echo "[$(ts)] حذف نسخة قديمة: $(basename "$d")"; rm -rf -- "$d" || true
    fi
  done < <(ls -1dt "$BACKUPS"/finance-* 2>/dev/null || true)
fi

# (3) مجلدات release-tools القديمة (احتفظ بالنشِط وأحدث KEEP_TOOLS)
if [[ -d "$TOOLS" ]]; then
  ACTIVE=""; [[ -f "$TOOLS/ACTIVE_DEPLOYMENT" ]] && ACTIVE=$(cat "$TOOLS/ACTIVE_DEPLOYMENT" 2>/dev/null || true)
  idx=0
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    base=$(basename "$d"); idx=$((idx+1))
    [[ "$base" == "$ACTIVE" || $idx -le $KEEP_TOOLS ]] && continue
    echo "[$(ts)] حذف tools قديمة: $base"; rm -rf -- "$d" || true
  done < <(ls -1dt "$TOOLS"/*/ 2>/dev/null | grep -E '/[0-9]+/$' || true)
fi

# (4) وسوم صور النشر القديمة (عدا الجارية والمحفوظة)
RUNNING_IMG=""; CID=$(docker compose -f "$PROD/docker-compose.yml" ps -q app 2>/dev/null || true)
[[ -n "$CID" ]] && RUNNING_IMG=$(docker inspect -f '{{.Image}}' "$CID" 2>/dev/null || true)
PROTECT=" $RUNNING_IMG $KEEP_IMG_IDS "
if [[ "$ACTIVE_DEPLOY" == 0 ]]; then
  while IFS=$'\t' read -r ref id; do
    [[ -z "$ref" ]] && continue
    [[ "$PROTECT" == *" $id "* ]] && continue
    echo "[$(ts)] إزالة وسم صورة: $ref"; docker rmi "$ref" >/dev/null 2>&1 || true
  done < <(docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}' 2>/dev/null | grep -E '^trbhh-(finance|rollback):' || true)
fi

# (5) تنظيف آمن للكاش والصور المعلّقة (لا volumes أبداً)
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true

echo "[$(ts)] انتهت سياسة الاحتفاظ."
df -h / 2>/dev/null | awk 'NR==2{print "  القرص: "$3" مستخدم من "$2" ("$5")"}'
