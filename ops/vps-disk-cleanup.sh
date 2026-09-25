#!/usr/bin/env bash
# فحص وتنظيف مساحة خادم تربح (Hostinger VPS) — آمن، لا يلمس قاعدة البيانات ولا الأسرار.
#
# الاستخدام على الخادم (كمستخدم root في /root):
#   bash vps-disk-cleanup.sh            # فحص فقط (dry-run) — لا يحذف شيئاً، يعرض التقرير
#   bash vps-disk-cleanup.sh --apply    # ينفّذ التنظيف الآمن فعلياً
#
# متغيّرات اختيارية:
#   KEEP_BACKUPS=3   عدد أحدث نسخ finance-* الاحتياطية التي تُحفظ (الافتراضي 3)
#   KEEP_TOOLS=3     عدد أحدث مجلدات release-tools التي تُحفظ (الافتراضي 3)
#
# ما لا يلمسه هذا السكربت أبداً: Docker volumes، قاعدة البيانات، .env/الأسرار،
# الوسائط الحيّة في الحاوية، آخر النسخ الاحتياطية المطلوبة للاسترجاع.
set -Eeuo pipefail

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1
KEEP_BACKUPS=${KEEP_BACKUPS:-3}
KEEP_TOOLS=${KEEP_TOOLS:-3}
PROD=/root/trbhh
BACKUPS=/root/trbhh-release-backups
TOOLS=/root/trbhh-release-tools

say(){ printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
run(){ # ينفّذ فقط مع --apply، وإلا يطبع فقط
  if [[ "$APPLY" == 1 ]]; then eval "$@"; else printf '  [dry-run] %s\n' "$*"; fi
}
human(){ numfmt --to=iec --suffix=B "${1:-0}" 2>/dev/null || echo "${1:-0}B"; }

[[ "$APPLY" == 1 ]] && echo "*** وضع التنفيذ الفعلي (--apply) ***" || echo "*** وضع الفحص فقط (dry-run) — أضِف --apply للتنفيذ ***"

# ————————————————————————————————— 1) مساحة القرص
say "1) مساحة القرص الكلية"
df -h / 2>/dev/null || df -h
echo
df -i / 2>/dev/null | sed -n '1,2p' || true   # inodes

# ————————————————————————————————— 2) أكبر المستهلكين
say "2) أكبر المجلدات تحت /root و /var/lib/docker (قد يستغرق قليلاً)"
du -xh -d1 /root 2>/dev/null | sort -rh | head -15 || true
echo "--- Docker root ---"
DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
du -xh -d1 "$DOCKER_ROOT" 2>/dev/null | sort -rh | head -10 || true

# ————————————————————————————————— 3) ما تضخّم آخر 48 ساعة
say "3) أكبر الملفات المُعدّلة خلال آخر 48 ساعة (أعلى 20)"
find /root "$DOCKER_ROOT" -xdev -type f -mtime -2 -printf '%s\t%TY-%Tm-%Td %TH:%TM\t%p\n' 2>/dev/null \
  | sort -rn | head -20 | awk -F'\t' '{printf "  %10.2f MB  %s  %s\n",$1/1048576,$2,$3}' || true

# ————————————————————————————————— 4) فحص Docker
say "4) فحص Docker"
echo "--- استخدام Docker (df) ---"; docker system df 2>/dev/null || true
echo "--- الصور trbhh-* ---"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null | grep -E '^trbhh' | sort || echo "  لا توجد"
echo "--- الحاويات الموقوفة ---"
docker ps -a --filter status=exited --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || true
echo "--- الـ volumes (لن تُحذف — للعرض فقط، بيانات قاعدة البيانات هنا) ---"
docker volume ls 2>/dev/null || true

# الصورة قيد التشغيل الآن — يجب ألا تُحذف
RUNNING_IMG=""
CID=$(docker compose -f "$PROD/docker-compose.yml" ps -q app 2>/dev/null || true)
[[ -n "$CID" ]] && RUNNING_IMG=$(docker inspect -f '{{.Image}}' "$CID" 2>/dev/null || true)
echo "  الصورة قيد التشغيل: ${RUNNING_IMG:-غير معروفة}"

# ————————————————————————————————— 5) مجلدات النسخ الاحتياطية وأدوات النشر
say "5) نسخ finance-* الاحتياطية (الأكبر مستهلك المتوقّع)"
if [[ -d "$BACKUPS" ]]; then
  du -sh "$BACKUPS" 2>/dev/null || true
  echo "--- كل نسخة (مرتّبة من الأحدث) مع حجمها وحالة التحقق ---"
  mapfile -t B < <(ls -1dt "$BACKUPS"/finance-* 2>/dev/null || true)
  for d in "${B[@]}"; do
    sz=$(du -sh "$d" 2>/dev/null | cut -f1)
    ver=$([[ -f "$d/VERIFIED" ]] && echo "VERIFIED" || echo "-")
    ext=$(ls -d "$d"/*-extracted 2>/dev/null | wc -l)
    printf "  %-45s %6s  %-8s extracted-dirs=%s\n" "$(basename "$d")" "$sz" "$ver" "$ext"
  done
  echo "  الإجمالي: ${#B[@]} نسخة — سيُحفظ أحدث $KEEP_BACKUPS، ويُحذف الباقي."
else
  echo "  لا يوجد $BACKUPS"
fi

# ————————————————————————————————— التنظيف الآمن
say "التنظيف الآمن"

# (أ) مجلدات *-extracted داخل كل النسخ: نسخ وسائط غير مضغوطة للتحقق فقط — تُحذف بأمان
say "(أ) حذف مجلدات *-extracted (نسخ تحقق غير مضغوطة، الأرشيف .tar.gz يبقى)"
if [[ -d "$BACKUPS" ]]; then
  while IFS= read -r ex; do
    [[ -z "$ex" ]] && continue
    sz=$(du -sh "$ex" 2>/dev/null | cut -f1)
    echo "  - $ex ($sz)"
    run "rm -rf -- '$ex'"
  done < <(find "$BACKUPS" -maxdepth 2 -type d -name '*-extracted' 2>/dev/null)
fi

# مجلد(ات) النسخ التي تشير إليها الحاوية العاملة (compose config_files) — لا تُحذف أبداً،
# لأن النشر يتحقّق من وجودها؛ حذفها يكسر كل النشرات اللاحقة.
PROTECTED=" "
_cid=$(docker compose -f "$PROD/docker-compose.yml" ps -q app 2>/dev/null || true)
if [[ -n "$_cid" ]]; then
  _label=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$_cid" 2>/dev/null || true)
  while IFS= read -r ref; do
    [[ "$ref" == "$BACKUPS/"* ]] || continue
    PROTECTED+="$(echo "$ref" | sed -E "s#($BACKUPS/[^/]+)/.*#\1#") "
  done < <(printf '%s' "$_label" | tr ',' '\n')
fi

# (ب) نسخ finance-* القديمة: احتفظ بأحدث KEEP_BACKUPS + مرجع الحاوية العاملة، احذف الأقدم
say "(ب) حذف نسخ finance-* الأقدم (الاحتفاظ بأحدث $KEEP_BACKUPS + مرجع الحاوية العاملة)"
KEEP_IMG_IDS=""
if [[ -d "$BACKUPS" ]]; then
  mapfile -t ALL < <(ls -1dt "$BACKUPS"/finance-* 2>/dev/null || true)
  idx=0
  for d in "${ALL[@]}"; do
    idx=$((idx+1))
    # اجمع معرّفات الصور التي تحتاجها النسخ المحفوظة (لحمايتها من حذف الصور لاحقاً)
    if [[ $idx -le $KEEP_BACKUPS || "$PROTECTED" == *" ${d%/} "* ]]; then
      for f in image-id.txt candidate-image-id.txt; do
        [[ -f "$d/$f" ]] && KEEP_IMG_IDS+=" $(cat "$d/$f" 2>/dev/null)"
      done
      if [[ "$PROTECTED" == *" ${d%/} "* && $idx -gt $KEEP_BACKUPS ]]; then echo "  [حماية — مرجع الحاوية العاملة] $(basename "$d")"; else echo "  [حفظ] $(basename "$d")"; fi
    else
      sz=$(du -sh "$d" 2>/dev/null | cut -f1)
      echo "  [حذف] $(basename "$d") ($sz)"
      run "rm -rf -- '$d'"
    fi
  done
fi

# (ج) مجلدات release-tools القديمة: احتفظ بالنشِط وأحدث KEEP_TOOLS
say "(ج) حذف مجلدات release-tools الأقدم (الاحتفاظ بالنشِط وأحدث $KEEP_TOOLS)"
if [[ -d "$TOOLS" ]]; then
  ACTIVE=""
  [[ -f "$TOOLS/ACTIVE_DEPLOYMENT" ]] && ACTIVE=$(cat "$TOOLS/ACTIVE_DEPLOYMENT" 2>/dev/null || true)
  mapfile -t T < <(ls -1dt "$TOOLS"/*/ 2>/dev/null | grep -E '/[0-9]+/$' || true)
  idx=0
  for d in "${T[@]}"; do
    idx=$((idx+1)); base=$(basename "$d")
    if [[ "$base" == "$ACTIVE" || $idx -le $KEEP_TOOLS ]]; then
      echo "  [حفظ] $base"
    else
      sz=$(du -sh "$d" 2>/dev/null | cut -f1)
      echo "  [حذف] $base ($sz)"
      run "rm -rf -- '$d'"
    fi
  done
fi

# (د) صور trbhh-finance:* و trbhh-rollback:* غير المستخدمة (عدا الجارية والمحفوظة)
say "(د) إزالة وسوم صور النشر القديمة (عدا الجارية ونسخ الاحتفاظ)"
PROTECT=" $RUNNING_IMG $KEEP_IMG_IDS "
while IFS=$'\t' read -r ref id; do
  [[ -z "$ref" ]] && continue
  if [[ "$PROTECT" == *" $id "* ]]; then
    echo "  [حفظ] $ref"
  else
    echo "  [حذف وسم] $ref"
    run "docker rmi '$ref' >/dev/null 2>&1 || true"
  fi
done < <(docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}' 2>/dev/null | grep -E '^trbhh-(finance|rollback):' || true)

# (هـ) صور معلّقة (dangling) + كاش البناء — آمنة تماماً
say "(هـ) تنظيف الصور المعلّقة وكاش البناء والحاويات الموقوفة"
run "docker image prune -f"          # dangling فقط (لا -a)
run "docker builder prune -f"        # كاش البناء (يُعاد بناؤه عند الحاجة)
run "docker container prune -f"      # الحاويات الموقوفة (التطبيق يعمل، لن يُمَس)
# ملاحظة: لا نستخدم 'docker volume prune' أبداً — قد يحوي بيانات قاعدة البيانات.

# (و) قصّ سجلات الحاويات الضخمة (>100MB) — قصّ لا حذف
say "(و) قصّ سجلات Docker الضخمة (>100MB)"
while IFS= read -r log; do
  [[ -z "$log" ]] && continue
  sz=$(stat -c %s "$log" 2>/dev/null || echo 0)
  echo "  - $log ($(human "$sz"))"
  run "truncate -s 0 '$log'"
done < <(find "$DOCKER_ROOT/containers" -name '*-json.log' -size +100M 2>/dev/null || true)

# (ز) سجلات النشر القديمة داخل النسخ/الأدوات المحذوفة أصلاً تُنظّف معها؛ نقصّ الكبيرة الباقية
say "(ز) قصّ ملفات deploy.log/operations.log الكبيرة الباقية (>50MB)"
while IFS= read -r log; do
  [[ -z "$log" ]] && continue
  sz=$(stat -c %s "$log" 2>/dev/null || echo 0)
  echo "  - $log ($(human "$sz"))"
  run "truncate -s 0 '$log'"
done < <(find "$TOOLS" "$BACKUPS" -maxdepth 2 -type f \( -name 'deploy.log' -o -name 'operations.log' \) -size +50M 2>/dev/null || true)

# ————————————————————————————————— النتيجة
say "النتيجة النهائية — مساحة القرص بعد التنظيف"
df -h / 2>/dev/null || df -h
docker system df 2>/dev/null || true
[[ "$APPLY" == 1 ]] || echo "
هذا كان فحصاً فقط. لتنفيذ الحذف الآمن فعلياً: bash vps-disk-cleanup.sh --apply"
