#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]]
cd /root/trbhh
release=46d7d108ff1511c3f991eff645050152481e7adb
if [[ ${1:-} != --run ]]; then
  [[ ${1:-} =~ ^[a-f0-9]{40}$ ]]
  revision=$1
  target=/root/trbhh-release-tools/local-intelligence-$(date +%s)
  [[ ! -e $target ]]
  mkdir -m 700 "$target"
  for file in manual-local-intelligence.sh local-intelligence-activation.cjs verify-runtime.cjs; do git show "$revision:scripts/release/$file" > "$target/$file"; done
  for file in protocol.cjs update-model.cjs inference-pool.cjs; do git show "$release:scripts/local-ai/$file" > "$target/$file"; done
  bash -n "$target/manual-local-intelligence.sh"
  unit=trbhh-local-intelligence-${target##*-}
  touch "$target/result.log"
  systemd-run --unit="$unit" --property=Type=exec --property=RuntimeMaxSec=330 /bin/bash "$target/manual-local-intelligence.sh" --run "$target"
  printf 'RESULT: tail -n 30 %s/result.log\n' "$target"
  (while systemctl is-active --quiet "$unit.service"; do sleep 3; done) &
  watcher=$!
  tail --pid="$watcher" -n 8 -f "$target/result.log"
  wait "$watcher"
  ! systemctl is-failed --quiet "$unit.service"
  exit 0
fi
target=${2:?}
[[ $target =~ ^/root/trbhh-release-tools/local-intelligence-[0-9]+$ && -d $target && ! -L $target ]]
exec > "$target/result.log" 2>&1
exec 9>/run/lock/trbhh-finance-deploy.lock
flock -n 9
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
exec 8>/run/lock/trbhh-local-ai-update.lock
flock -n 8
exec 7>/run/lock/trbhh-semantic-index.lock
flock -n 7
[[ $(git rev-parse HEAD) == "$release" ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-app) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' trbhh-app) == "$release" ]]
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
echo 'LOCAL_INTELLIGENCE_GATE — installed model only; no app restart, product changes or downloads.'
{
 for pair in 'protocol.cjs:__trbhhLocalProtocol' 'update-model.cjs:__trbhhLocalUpdater' 'inference-pool.cjs:__trbhhInferencePool'; do
  file=${pair%%:*}; name=${pair##*:}
  printf 'globalThis.%s=(()=>{const module={exports:{}};\n' "$name"
  cat "$target/$file"
  printf '\nreturn module.exports;})();\n'
 done
 cat "$target/local-intelligence-activation.cjs"
} | docker exec -i trbhh-app timeout --signal=TERM --kill-after=20s 300s nice -n 10 node -
docker inspect trbhh-app > "$target/after.json"
node "$target/verify-runtime.cjs" "$target/before.json" "$target/after.json"
[[ $(sha256sum .env | cut -d' ' -f1) == "$env_hash" ]]
echo 'LOCAL_INTELLIGENCE_RUNTIME_UNCHANGED — inspect LOCAL_INTELLIGENCE_READY proof above; distinct-query throughput remains unverified.'
