#!/usr/bin/env bash
set -Eeuo pipefail
assets_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd /root/trbhh
exec 9>/run/lock/trbhh-local-ai-update.lock
flock -n 9 || exit 0
# Preserve capacity for MySQL, Next.js, Redis and the existing local translator.
total_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( total_kib >= 15 * 1024 * 1024 && available_kib >= 4 * 1024 * 1024 )) || { echo 'Local AI: insufficient available memory; no update attempted.' >&2; exit 1; }
docker_root=$(docker info --format '{{.DockerRootDir}}')
[[ -d "$docker_root" ]] || exit 1
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 12 * 1024 * 1024 )) || { echo 'Local AI: insufficient disk space; previous model retained.' >&2; exit 1; }
bash "$assets_root/scripts/local-ai/run-model.sh"
