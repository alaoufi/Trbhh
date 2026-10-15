#!/usr/bin/env bash
# Manual SSH provisioning only. Does not rebuild/recreate app, DB, Redis or media.
set -Eeuo pipefail
cd /root/trbhh
[[ $EUID -eq 0 ]] || { echo 'Run from the VPS root SSH session.' >&2; exit 1; }
total_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( total_kib >= 7 * 1024 * 1024 && available_kib >= 6 * 1024 * 1024 )) || { echo 'Local AI needs an approximately 8 GB or larger VPS and 6 GB free RAM for first provisioning.' >&2; exit 1; }
docker_root=$(docker info --format '{{.DockerRootDir}}')
[[ -d "$docker_root" ]] || exit 1
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 8 * 1024 * 1024 )) || { echo 'Local AI needs 8 GB free Docker disk space.' >&2; exit 1; }
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.local-ai.yml up -d --no-deps ollama
for attempt in {1..30}; do
  if docker exec trbhh-ollama ollama list >/dev/null 2>&1; then break; fi
  (( attempt < 30 )) || exit 1
  sleep 2
done
# Uses the running app's Node only; no application/database code is executed.
bash scripts/local-ai/update-model.sh
install -m 644 scripts/local-ai/trbhh-local-ai-update.service /etc/systemd/system/
install -m 644 scripts/local-ai/trbhh-local-ai-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now trbhh-local-ai-update.timer
echo 'Local runtime and validated model ready; daily updates installed. Application release is a separate manual operation.'
