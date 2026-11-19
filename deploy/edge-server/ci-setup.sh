#!/usr/bin/env bash
# يسمح لـGitHub Actions بنشر «تربح» — تجهيز لمرة واحدة ينفّذه المالك بصلاحية root على الخادم:
#   cd /opt/trbhh && git pull --ff-only && bash deploy/edge-server/ci-setup.sh
# 1. مفتاح نشر لـGitHub في /etc/trbhh/ci (root فقط، خارج النسخ الاحتياطية).
# 2. سطره في /root/.ssh/authorized_keys مقيّداً: لا يشغّل إلا deploy/edge-server/ci-command.sh
#    (status أو نشر حفظة مختبرة)، بلا Shell ولا تمرير. يُضاف أو يُستبدل سطر هذا المفتاح فقط
#    (المعلَّم trbhh-github-deploy)؛ سطور بقية المواقع لا تُمسّ ولا يتغيّر ترتيبها.
# 3. يطبع مفتاح الخادم العام ليتحقق GitHub أنه يكلّم هذا الخادم.
# المفتاح الخاص لا يُطبع أبداً: ينسخه المالك بـscp إلى سر GitHub.
# التراجع: احذف السطر المنتهي بـ trbhh-github-deploy من /root/.ssh/authorized_keys.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
REPO_DIR=/opt/trbhh
KEY_DIR=/etc/trbhh/ci
KEY="$KEY_DIR/github-deploy"
MARK=trbhh-github-deploy
AUTH=/root/.ssh/authorized_keys

install -d -m 700 "$KEY_DIR" /root/.ssh
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N '' -C "$MARK" -f "$KEY"
chmod 600 "$KEY"
touch "$AUTH"; chmod 600 "$AUTH"
line="command=\"/usr/bin/bash $REPO_DIR/deploy/edge-server/ci-command.sh\",restrict $(cat "$KEY.pub")"
{ grep -v " $MARK\$" "$AUTH" || true; echo "$line"; } > "$AUTH.trbhh-new"
cat "$AUTH.trbhh-new" > "$AUTH"; rm -f "$AUTH.trbhh-new"
grep -c " $MARK\$" "$AUTH" | grep -qx 1 || { echo "NOT READY: the key line was not written once"; exit 1; }

echo "OK: مفتاح نشر GitHub جاهز (يستطيع فقط قراءة الإصدار أو نشر حفظة مختبرة)."
echo
echo "السر TRBHH_HOST_KEY (عام، لا ضرر في عرضه):"
echo "84.247.166.216 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
echo
echo "السر TRBHH_DEPLOY_KEY: محتوى الملف $KEY — لا يُطبع هنا؛ انسخه بـscp إلى جهازك ثم إلى أسرار GitHub."
