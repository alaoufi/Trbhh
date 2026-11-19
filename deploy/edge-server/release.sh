#!/usr/bin/env bash
# نشر الحفظة الحالية في /opt/trbhh على الخادم المشترك: يبني الصورة الجديدة والقديمة ما زالت تخدم،
# ثم يبدّل الحاوية (ثوانٍ)، ويتحقق أن التطبيق يعرض الحفظة نفسها ويجيب، وإلا يرجع للسابقة تلقائياً.
# يمس حاويات وصور trbhh-* فقط.
set -euo pipefail
cd /opt/trbhh
COMPOSE=(docker compose -f deploy/edge-server/compose.yml)
STATE=/srv/trbhh/release-current
commit="$(git rev-parse HEAD)"
prev="$(cat "$STATE" 2>/dev/null || true)"

probe() { curl -fsS --max-time 5 -H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:8101$1"; }
wait_live() {
  local want="$1" i
  for i in $(seq 1 90); do
    if probe /api/version 2>/dev/null | grep -q "\"$want\"" && probe / -o /dev/null 2>/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

echo "release: building $commit (live: ${prev:-none})"
TRBHH_RELEASE_COMMIT="$commit" "${COMPOSE[@]}" build app
TRBHH_RELEASE_COMMIT="$commit" "${COMPOSE[@]}" up -d --no-build
if wait_live "$commit"; then
  echo "$commit" > "$STATE"
  # صور تربح الأقدم من الحالية والسابقة تُزال (صور هذا الموقع فقط).
  docker images trbhh-app --format '{{.Tag}}' | grep -E '^[0-9a-f]{40}$' | grep -v -e "^$commit\$" -e "^${prev:-none}\$" | xargs -r -I{} docker rmi "trbhh-app:{}" >/dev/null 2>&1 || true
  echo "RELEASE_OK $commit"
  exit 0
fi
echo "release: $commit did not become healthy"
docker logs --tail 40 trbhh-app 2>&1 | sed 's/^/app| /' || true
if [[ "$prev" =~ ^[0-9a-f]{40}$ ]] && docker image inspect "trbhh-app:$prev" >/dev/null 2>&1; then
  TRBHH_RELEASE_COMMIT="$prev" "${COMPOSE[@]}" up -d --no-build app
  wait_live "$prev" && echo "RELEASE_FAILED rolled back to $prev" || echo "RELEASE_FAILED and rollback to $prev is not healthy"
else
  echo "RELEASE_FAILED no previous release to roll back to"
fi
exit 1
