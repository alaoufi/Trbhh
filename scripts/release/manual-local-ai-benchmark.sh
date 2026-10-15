#!/usr/bin/env bash
# Reversible model evaluation only: no application deployment, alias promotion or deletion.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 && ${1:-} =~ ^[a-f0-9]{40}$ ]]
revision=$1
mode=${2:---measure-9b}
[[ $mode == --measure-9b || $mode == --compare || $mode == --verify-purpose ]]
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh ]]
exec 8>/run/lock/trbhh-finance-deploy.lock
flock -n 8 || { echo 'An application release is active.' >&2; exit 1; }
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
exec 9>/run/lock/trbhh-local-ai-update.lock
flock -n 9 || { echo 'Another local model operation is active.' >&2; exit 1; }
[[ $(docker inspect -f '{{.State.Running}}' trbhh-app) == true ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-ollama) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-ollama) == 10737418240 ]]
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-ollama) == 4000000000 ]]
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 12*1024*1024 )) || { echo 'Insufficient available host memory.' >&2; exit 1; }
docker_root=$(docker info --format '{{.DockerRootDir}}')
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 16*1024*1024 )) || { echo 'Insufficient free model disk space.' >&2; exit 1; }
candidate=a5a3dedb66345d0b6e52bbe7355d22bb2958d553
git fetch --no-tags origin codex/admin-navigation-complete-20261014
[[ $(git rev-parse FETCH_HEAD) == "$candidate" ]]
target=$(mktemp -d /root/trbhh-release-tools/local-ai-benchmark.XXXXXX)
git show "$candidate:scripts/local-ai/protocol.cjs" > "$target/protocol.cjs"
git show "$candidate:scripts/local-ai/update-model.cjs" > "$target/update-model.cjs"
git show "$revision:scripts/release/local-ai-benchmark.cjs" > "$target/benchmark.cjs"
echo "BENCHMARK_LOG=$target/result.log"
{
 printf 'globalThis.__trbhhLocalProtocol=(()=>{const module={exports:{}};\n'
 cat "$target/protocol.cjs"
 printf '\nreturn module.exports;})();\nglobalThis.__trbhhLocalGate=(()=>{const module={exports:{},id:"benchmark-quality-gate"};\n'
 cat "$target/update-model.cjs"
 printf '\nreturn module.exports.smoke;})();\n'
 cat "$target/benchmark.cjs"
} | docker exec -i trbhh-app node - "$mode" |& tee "$target/result.log"
