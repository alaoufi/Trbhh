#!/usr/bin/env bash
# Isolated candidate evaluation. No app deployment, model alias promotion or database commands.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 && ${1:-} =~ ^[a-f0-9]{40}$ ]]
revision=$1
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh ]]
exec 8>/run/lock/trbhh-finance-deploy.lock
flock -n 8 || { echo 'A release is active.' >&2; exit 1; }
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
exec 9>/run/lock/trbhh-local-ai-update.lock
flock -n 9 || { echo 'A model operation is active.' >&2; exit 1; }
[[ $(docker inspect -f '{{.State.Running}}' trbhh-app) == true ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-ollama) == true ]]
[[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-ollama) == 10737418240 ]]
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-ollama) == 4000000000 ]]
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 12*1024*1024 )) || { echo 'Insufficient available memory for safe evaluation.' >&2; exit 1; }
docker_root=$(docker info --format '{{.DockerRootDir}}')
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 4*1024*1024 )) || { echo 'Insufficient model disk space.' >&2; exit 1; }
target=$(mktemp -d /root/trbhh-release-tools/semantic-benchmark.XXXXXX)
git show "$revision:scripts/release/local-semantic-benchmark.cjs" > "$target/benchmark.cjs"
echo "SEMANTIC_LOG=$target/result.log"
echo 'SEMANTIC_EVALUATION — first download about 622 MB; no application deployment.'
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} RAM={{.MemUsage}}' trbhh-app trbhh-ollama
timeout --signal=TERM --kill-after=10s 660s docker exec -i trbhh-app node - < "$target/benchmark.cjs" |& tee "$target/result.log"
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} RAM={{.MemUsage}}' trbhh-app trbhh-ollama
