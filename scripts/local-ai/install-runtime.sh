#!/usr/bin/env bash
# Manual SSH provisioning only. Does not rebuild/recreate app, DB, Redis or media.
set -Eeuo pipefail
assets_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd /root/trbhh
[[ $EUID -eq 0 ]] || { echo 'Run from the VPS root SSH session.' >&2; exit 1; }
mode=${1:-all}
[[ $mode == all || $mode == --provision-only || $mode == --install-timer-only ]] || exit 1
if [[ $mode == --install-timer-only ]]; then
  [[ -f /root/trbhh/scripts/local-ai/update-model.cjs ]]
  install -m 644 "$assets_root/scripts/local-ai/trbhh-local-ai-update.service" /etc/systemd/system/
  install -m 644 "$assets_root/scripts/local-ai/trbhh-local-ai-update.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now trbhh-local-ai-update.timer
  echo DAILY_LOCAL_MODEL_UPDATES_ENABLED
  exit 0
fi
total_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( total_kib >= 15 * 1024 * 1024 && available_kib >= 12 * 1024 * 1024 )) || { echo 'Local AI needs a 16 GB or larger VPS and 12 GB available RAM for first provisioning.' >&2; exit 1; }
docker_root=$(docker info --format '{{.DockerRootDir}}')
[[ -d "$docker_root" ]] || exit 1
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 16 * 1024 * 1024 )) || { echo 'Local AI needs 16 GB free Docker disk space.' >&2; exit 1; }
project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-app)
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]]
architecture=$(docker info --format '{{.Architecture}}')
[[ $architecture == x86_64 || $architecture == amd64 ]] || { echo 'Local AI runtime requires the verified amd64 image.' >&2; exit 1; }
if docker inspect trbhh-ollama >/dev/null 2>&1; then
  [[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
  [[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-ollama) == "$project" ]]
fi
docker compose --project-directory /root/trbhh --project-name "$project" -f /root/trbhh/docker-compose.yml -f "$assets_root/docker-compose.local-ai.yml" config --quiet
echo 'LOCAL_AI_IMAGE_PULL — downloading verified CPU-capable runtime; progress hidden.'
if ! docker compose --project-directory /root/trbhh --project-name "$project" -f /root/trbhh/docker-compose.yml -f "$assets_root/docker-compose.local-ai.yml" pull --quiet ollama > "$assets_root/ollama-image-pull.log" 2>&1; then
  echo 'LOCAL_AI_IMAGE_PULL_FAILED — application has not been changed.' >&2
  tail -n 10 "$assets_root/ollama-image-pull.log" >&2
  exit 1
fi
echo 'LOCAL_AI_IMAGE_READY'
docker compose --project-directory /root/trbhh --project-name "$project" -f /root/trbhh/docker-compose.yml -f "$assets_root/docker-compose.local-ai.yml" up -d --pull never --no-deps ollama
for attempt in {1..30}; do
  if docker exec trbhh-ollama ollama list >/dev/null 2>&1; then break; fi
  (( attempt < 30 )) || exit 1
  sleep 2
done
echo 'LOCAL_AI_MODEL_DOWNLOAD_AND_TEST — first model download may take several minutes.'
# Uses the running app's Node only; no application/database code is executed.
bash "$assets_root/scripts/local-ai/update-model.sh"
if [[ $mode != --provision-only ]]; then bash "$assets_root/scripts/local-ai/install-runtime.sh" --install-timer-only; fi
echo 'LOCAL_MODEL_PREPARED — application activation has not been confirmed.'
