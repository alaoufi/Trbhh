#!/usr/bin/env bash
# Read-only bounded pressure probe. Never activates or deploys application code.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 && ${1:-} =~ ^[a-f0-9]{40}$ ]]
revision=$1
candidate=e9ffc5b266b13137d7a8252635445a5b43e3c032
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh ]]
exec 8>/run/lock/trbhh-finance-deploy.lock
flock -n 8 || { echo 'A release is active; capacity test skipped.' >&2; exit 1; }
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
exec 9>/run/lock/trbhh-local-ai-update.lock
flock -n 9 || { echo 'A model update is active; capacity test skipped.' >&2; exit 1; }
[[ $(docker inspect -f '{{.State.Running}}' trbhh-app) == true ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-ollama) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-ollama) == 10737418240 ]]
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-ollama) == 4000000000 ]]
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 12*1024*1024 )) || { echo 'Not enough available RAM for a safe pressure test.' >&2; exit 1; }
git fetch --no-tags origin codex/admin-navigation-complete-20261014
[[ $(git rev-parse FETCH_HEAD) == "$candidate" ]]
git cat-file -e "$revision:scripts/release/manual-search-capacity.sh"
target=$(mktemp -d /root/trbhh-release-tools/search-capacity.XXXXXX)
for file in protocol.cjs inference-pool.cjs capacity-check.cjs; do
  git show "$candidate:scripts/local-ai/$file" > "$target/$file"
done
echo "CAPACITY_LOG=$target/result.log"
echo 'CAPACITY_TEST — maximum 4 minutes; no deployment, downloads or purchases.'
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} RAM={{.MemUsage}}' trbhh-app trbhh-ollama
{
 printf 'globalThis.__trbhhCapacityProtocol=(()=>{const module={exports:{}};\n'
 cat "$target/protocol.cjs"
 printf '\nreturn module.exports;})();\nglobalThis.__trbhhCapacityPool=(()=>{const module={exports:{}};\n'
 cat "$target/inference-pool.cjs"
 printf '\nreturn module.exports.createInferencePool;})();\n'
 cat "$target/capacity-check.cjs"
} | timeout --signal=TERM --kill-after=10s 270s docker exec -i trbhh-app node - "$candidate" |& tee "$target/result.log"
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} RAM={{.MemUsage}}' trbhh-app trbhh-ollama
