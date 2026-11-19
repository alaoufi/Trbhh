#!/usr/bin/env bash
# ربط «تربح» على الخادم المشترك بمخزن R2. يطلب المفتاح والسر في الطرفية (لا يظهران ولا يُطبعان)،
# ويحفظهما في /etc/trbhh فقط (صلاحية 600)، ثم يجرّب الاتصال فعلاً.
#   bash r2-setup.sh media   <ACCOUNT_ID>    مخزن الوسائط trbhh-media (يكتب R2_* في app.env أيضاً)
#   bash r2-setup.sh backups <ACCOUNT_ID>    مخزن النسخ trbhh-backups
# إعداد rclone في ملف خاص بتربح (/etc/trbhh/rclone.conf) لا في إعداد root المشترك.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
kind="${1:-}"; acct="${2:-}"
[[ "$kind" == media || "$kind" == backups ]] || { echo "الاستعمال: $0 media|backups <ACCOUNT_ID>" >&2; exit 2; }
[[ "$acct" =~ ^[0-9a-f]{32}$ ]] || { echo "ACCOUNT_ID يجب أن يكون 32 حرفاً (من رابط r2.cloudflarestorage.com)" >&2; exit 2; }
command -v rclone >/dev/null || { echo "rclone غير مثبّت على الخادم" >&2; exit 3; }
umask 077
CONF=/etc/trbhh/rclone.conf
remote="trbhh-$kind"

# اللصق بالزر الأيمن في PowerShell قد يلصق القيمة مرتين: نكتشف التكرار ونأخذ نصفها.
dedupe() { local v="${1//[[:space:]]/}" n="$2"; if [[ ${#v} -eq $((n*2)) && "${v:0:n}" == "${v:n}" ]]; then v="${v:0:n}"; fi; printf '%s' "$v"; }
read -r -s -p 'Access Key ID: ' K; echo
read -r -s -p 'Secret Access Key: ' S; echo
K="$(dedupe "$K" 32)"; S="$(dedupe "$S" 64)"
echo "LEN key=${#K} secret=${#S}"
[[ "$K" =~ ^[0-9a-f]{32}$ && "$S" =~ ^[0-9a-f]{64}$ ]] || { echo "R2_FAIL: الأطوال غير صحيحة (المطلوب 32 و64) — أعد الأمر والصق كل قيمة مرة واحدة" >&2; exit 1; }

rclone --config "$CONF" config create "$remote" s3 provider Cloudflare access_key_id "$K" secret_access_key "$S" \
  endpoint "https://$acct.r2.cloudflarestorage.com" region auto acl private no_check_bucket true >/dev/null 2>&1
chmod 600 "$CONF"

# المفتاح مقيّد بعنوان الخادم IPv4: نربط rclone به صراحةً (بعض الإصدارات تتجاهل 0.0.0.0).
pub="$(curl -4 -s --max-time 10 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' || true)"
if [[ "$pub" =~ ^[0-9.]+$ ]] && ip -4 -o addr 2>/dev/null | grep -qw "$pub"; then bind="$pub"; else bind=0.0.0.0; fi
echo "$bind" > /etc/trbhh/rclone-bind
if ! rclone --config "$CONF" --bind "$bind" size "$remote:$remote"; then
  echo "R2_FAIL: رُفض الاتصال — راجع صلاحية المفتاح والمخزن ومرشح العناوين (عنوان هذا الخادم: ${pub:-غير معروف})" >&2; exit 1
fi

if [[ "$kind" == media ]]; then
  env=/etc/trbhh/app.env
  { grep -v -E '^R2_(ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|MEDIA_BUCKET)=' "$env" || true
    printf 'R2_ACCOUNT_ID=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\nR2_MEDIA_BUCKET=trbhh-media\n' "$acct" "$K" "$S"; } > "$env.new"
  cat "$env.new" > "$env"; rm -f "$env.new"; chmod 600 "$env"
fi
unset K S
echo "R2_OK $remote (bind=$bind)"
