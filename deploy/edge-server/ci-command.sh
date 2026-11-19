#!/usr/bin/env bash
# ما يُسمح به لمفتاح نشر GitHub على الخادم، ولا شيء غيره. سطر المفتاح في
# /root/.ssh/authorized_keys يفرض هذا السكربت (command="…",restrict: بلا Shell ولا تمرير منافذ)
# مهما طلب الاتصال. الطلب يأتي في SSH_ORIGINAL_COMMAND:
#   status            الحفظة الحية لـ«تربح»
#   deploy <commit>   يسحب الكود، ويتأكد أن الخادم على الحفظة نفسها التي اختبرها GitHub، ثم
#                     deploy/edge-server/release.sh. حفظة أحدث أو أقدم تُرفض ولا تُخمَّن.
# نشر واحد في كل مرة. كل شيء يُسجَّل في /var/log/trbhh-ci.log. يمس موارد trbhh فقط.
set -euo pipefail
REPO_DIR=/opt/trbhh
LOG=/var/log/trbhh-ci.log
request="${SSH_ORIGINAL_COMMAND:-}"

case "$request" in
  status)
    echo "recorded: $(cat /srv/trbhh/release-current 2>/dev/null || echo none)"
    echo "live: $(curl -fsS --max-time 5 -H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8101/api/version 2>/dev/null || echo unavailable)"
    exit 0 ;;
  deploy\ *)
    commit="${request#deploy }"
    [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: 'deploy' needs a full 40-character commit id"; exit 2; } ;;
  *)
    echo "refused: this key may only run 'status' or 'deploy <commit>'"; exit 2 ;;
esac

exec 8> /run/trbhh-ci.lock
flock -n 8 || { echo "another deploy is running; try again when it ends"; exit 3; }

set +e
{
  set -e
  echo "== $(date -u +%FT%TZ) deploy $commit (from GitHub)"
  cd "$REPO_DIR"
  git pull --ff-only -q
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$commit" ]]; then
    echo "not deploying: the server's branch is at $head, GitHub asked for $commit"
    exit 4
  fi
  bash deploy/edge-server/release.sh
} 2>&1 | tee -a "$LOG"
status="${PIPESTATUS[0]}"
echo "== $(date -u +%FT%TZ) exit $status" >> "$LOG"
exit "$status"
