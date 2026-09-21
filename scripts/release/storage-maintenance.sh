#!/usr/bin/env bash
set -euo pipefail
mode=${1:-audit}
[[ "$mode" == audit || "$mode" == cleanup ]] || exit 1
if [[ "$mode" == cleanup ]]; then
  # Fixed inventory reviewed on 2026-09-22; never auto-select delete targets.
  base=/root/trbhh-release-backups
  # This is the self-contained full backup at the root of the active Salla and
  # supplier-release chain. All newer compact checkpoints ultimately bind to it.
  keep=/root/trbhh-release-backups/audit-35603864905
  legacy_base=/root/trbhh/backups
  for parent in "$base" "$keep" "$legacy_base"; do
    [[ -d "$parent" && ! -L "$parent" && "$(realpath "$parent")" == "$parent" ]] || exit 1
  done
  [[ -f "$keep/VERIFIED" && ! -L "$keep/VERIFIED" && ! -e "$keep/WATCHDOG_FIRED" ]] || exit 1
  [[ "$(cat "$keep/VERIFIED")" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459 ]] || exit 1
  [[ "$(cat "$keep/DEPLOYMENT_VERIFIED")" == 5f8dbc01c38bf431a9ae099a581b80536097b346 ]] || exit 1
  [[ -f "$keep/SHA256SUMS" && ! -L "$keep/SHA256SUMS" ]] || exit 1
  # Five self-contained archives; retained media must not depend on older dirs.
  expected=$(printf '%s\n' code.tar.gz database.sql.gz image.tar.gz legacy.tar.gz storage.tar.gz | sort)
  actual=$(awk '{print $2}' "$keep/SHA256SUMS" | sort)
  [[ "$actual" == "$expected" ]] || exit 1
  for name in code.tar.gz database.sql.gz image.tar.gz legacy.tar.gz storage.tar.gz; do
    [[ -f "$keep/$name" && ! -L "$keep/$name" && -s "$keep/$name" ]] || exit 1
  done
  printf 'VERIFY_RETAINED_BACKUP %s\n' "$keep"
  (cd "$keep" && sha256sum --strict --check SHA256SUMS)
  gzip -t "$keep/code.tar.gz" "$keep/database.sql.gz" "$keep/image.tar.gz" "$keep/legacy.tar.gz" "$keep/storage.tar.gz"
  [[ -f "$keep/full-restored.json" && -s "$keep/full-restored.json" ]] || exit 1
  if docker ps --format '{{.Names}}' | grep -Eq '^trbhh-(backup-reader|restore)-'; then
    echo 'An active backup/restore helper exists; refusing cleanup'; exit 1
  fi
  if pgrep -f '[s]afeguards.sh|[f]ull-backup.sh' >/dev/null; then
    echo 'A backup process is still active; refusing cleanup'; exit 1
  fi
  targets=(
    /root/trbhh-release-backups/audit-35465592273
  )
  # Validate every exact target and all mounts before the first deletion.
  mounts=$(findmnt -rn -o TARGET)
  containers=$(docker ps -aq)
  docker_mounts=''
  if [[ -n "$containers" ]]; then
    docker_mounts=$(docker inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' $containers)
  fi
  for target in "${targets[@]}"; do
    [[ "$target" != "$keep" && ! -L "$target" ]] || exit 1
    [[ -e "$target" ]] || continue
    [[ "$(realpath "$target")" == "$target" ]] || exit 1
    parent=$(dirname "$target")
    [[ "$parent" == "$base" || "$parent" == "$legacy_base" ]] || exit 1
    while IFS= read -r mount; do
      [[ -z "$mount" ]] && continue
      [[ "$mount" != "$target" && "$mount" != "$target/"* ]] || { echo 'Backup target is mounted; refusing cleanup'; exit 1; }
    done <<< "$mounts"
    while IFS= read -r mount; do
      [[ -z "$mount" ]] && continue
      mount=$(realpath "$mount")
      [[ "$mount" != / && "$mount" != "$target" && "$mount" != "$target/"* && "$target" != "$mount/"* ]] || { echo 'Backup target overlaps Docker data; refusing cleanup'; exit 1; }
    done <<< "$docker_mounts"
  done
  cd /root/trbhh
  app=$(docker compose ps -q app)
  test -n "$app"
  test "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$app")" = 'true false'
  before_free=$(df -Pk / | awk 'NR==2 {print $4}')
  for target in "${targets[@]}"; do
    [[ -e "$target" ]] || continue
    printf 'REMOVING_BACKUP %s\n' "$target"
    if [[ -d "$target" ]]; then rm -rf --one-file-system -- "$target"; else rm -f -- "$target"; fi
    [[ ! -e "$target" ]] || exit 1
  done
  test -s "$keep/VERIFIED"
  test -s "$keep/database.sql.gz"
  test -s "$keep/legacy.tar.gz"
  test "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$app")" = 'true false'
  after_free=$(df -Pk / | awk 'NR==2 {print $4}')
  printf 'FREED_KB=%s\nRETAINED_BACKUP=%s\n' "$((after_free-before_free))" "$keep"
  df -Pk /
  du -sk "$base"
  docker inspect -f 'running={{.State.Running}} paused={{.State.Paused}}' "$app"
  exit 0
fi
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
