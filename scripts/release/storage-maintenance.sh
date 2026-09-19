#!/usr/bin/env bash
set -euo pipefail
mode=${1:-audit}
[[ "$mode" == audit ]] || { echo 'Cleanup is not configured until inventory is reviewed'; exit 1; }
printf 'DISK\n'
df -Pk /
printf 'ROOT_USAGE_KB\n'
du -x -k --max-depth=1 /root /var /home 2>/dev/null | sort -n
printf 'BACKUP_INVENTORY\n'
for base in /root/trbhh-release-backups /root/trbhh/backups /var/backups; do
  [[ -d "$base" && ! -L "$base" && "$(realpath "$base")" == "$base" ]] || continue
  find "$base" -mindepth 1 -maxdepth 1 -printf '%y %TY-%Tm-%TdT%TH:%TM:%TS %p\n' | sort
  du -x -k --max-depth=1 "$base" 2>/dev/null | sort -n
done
for dir in /root/trbhh-release-backups/audit-*; do
  [[ -d "$dir" && ! -L "$dir" ]] || continue
  printf 'BACKUP %s\n' "$dir"
  for marker in VERIFIED DEPLOYMENT_VERIFIED commit.txt WATCHDOG_FIRED; do
    if [[ -f "$dir/$marker" && ! -L "$dir/$marker" ]]; then
      printf '%s=' "$marker"
      if [[ "$marker" == WATCHDOG_FIRED ]]; then printf 'present\n'; else head -c 80 "$dir/$marker"; printf '\n'; fi
    fi
  done
  find "$dir" -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
done
printf 'CONTAINERS\n'
docker ps -a --format '{{.Names}} {{.Status}}'
printf 'DOCKER_USAGE\n'
docker system df
cd /root/trbhh
printf 'PRODUCTION_HEAD='; git rev-parse HEAD
app=$(docker compose ps -q app)
test -n "$app"
docker inspect -f 'running={{.State.Running}} paused={{.State.Paused}}' "$app"
test "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$app")" = 'true false'
