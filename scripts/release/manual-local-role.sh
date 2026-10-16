#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]]
cd /root/trbhh
if [[ ${1:-} != --run ]]; then
  revision=${1:?tool revision required}
  candidate=${2:?candidate application SHA required}
  role=${3:?search or translation required}
  mode=${4:---probe-only}
  [[ $revision =~ ^[a-f0-9]{40}$ && $candidate =~ ^[a-f0-9]{40}$ ]]
  [[ $role == search || $role == translation ]]
  [[ $mode == --probe-only || $mode == --activate ]]
  git cat-file -e "$candidate^{commit}"
  target=/root/trbhh-release-tools/local-role-$(date +%s)
  [[ ! -e $target ]]
  mkdir -m 700 "$target"
  for file in manual-local-role.sh local-role-activation.cjs verify-runtime.cjs; do git show "$revision:scripts/release/$file" > "$target/$file"; done
  for file in protocol.cjs; do git show "$candidate:scripts/local-ai/$file" > "$target/$file"; done
  bash -n "$target/manual-local-role.sh"
  unit=trbhh-local-role-${target##*-}
  touch "$target/result.log"
  systemd-run --unit="$unit" --property=Type=exec --property=RuntimeMaxSec=620 /bin/bash "$target/manual-local-role.sh" --run "$target" "$candidate" "$role" "$mode"
  printf 'RESULT: tail -n 30 %s/result.log\n' "$target"
  (while systemctl is-active --quiet "$unit.service"; do sleep 3; done) &
  watcher=$!
  tail --pid="$watcher" -n 8 -f "$target/result.log"
  wait "$watcher"
  ! systemctl is-failed --quiet "$unit.service"
  exit 0
fi
target=${2:?}
candidate=${3:?}
role=${4:?}
mode=${5:?}
[[ $candidate =~ ^[a-f0-9]{40}$ ]]
[[ $role == search || $role == translation ]]
[[ $mode == --probe-only || $mode == --activate ]]
[[ $target =~ ^/root/trbhh-release-tools/local-role-[0-9]+$ && -d $target && ! -L $target ]]
exec > "$target/result.log" 2>&1
exec 9>/run/lock/trbhh-finance-deploy.lock
flock -n 9
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
exec 8>/run/lock/trbhh-local-ai-update.lock
flock -n 8
exec 7>/run/lock/trbhh-semantic-index.lock
flock -n 7
[[ $(git rev-parse HEAD) == "$candidate" ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-app) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' trbhh-app) == "$candidate" ]]
project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-app)
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-ollama) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
[[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-ollama) == "$project" ]]
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-ollama) == 4000000000 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-ollama) == 10737418240 ]]
[[ $(docker inspect -f '{{.HostConfig.MemorySwap}}' trbhh-ollama) == 10737418240 ]]
image=ollama/ollama:0.40.4-rocm@sha256:60cc4504526c70f5f693f5405c129efe7784c9b5c99b22ff41dbf7667a1a637f
[[ $(docker inspect -f '{{.Image}}' trbhh-ollama) == $(docker image inspect -f '{{.Id}}' "$image") ]]
docker inspect trbhh-app > "$target/before.json"
env_hash=$(sha256sum .env | cut -d' ' -f1)
# Verify preservation after either success or failure. The JS tool owns role rollback.
finish() {
  code=$?
  trap - EXIT
  docker inspect trbhh-app > "$target/after.json"
  node "$target/verify-runtime.cjs" "$target/before.json" "$target/after.json" || code=1
  [[ $(sha256sum .env | cut -d' ' -f1) == "$env_hash" ]] || code=1
  exit "$code"
}
trap finish EXIT
echo "LOCAL_ROLE_GATE role=$role mode=$mode — installed weights only, no app restart or product writes."
{
 printf 'globalThis.__trbhhLocalProtocol=(()=>{const module={exports:{}};\n'
 cat "$target/protocol.cjs"
 printf '\nreturn module.exports;})();\n'
 cat "$target/local-role-activation.cjs"
} | docker exec -i trbhh-app timeout --signal=TERM --kill-after=20s 590s nice -n 10 node - "$role" "$candidate" "$mode"
echo 'LOCAL_ROLE_RUNTIME_UNCHANGED — role aliases have independent rollback; no application deployment.'
