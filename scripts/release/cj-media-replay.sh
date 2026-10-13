#!/usr/bin/env bash
# Reproduce archive extraction only in an owned scratch bind mount.
set +x +v
set -Eeuo pipefail
umask 077
if [[ $# != 1 || ! ${1:-} =~ ^[1-9][0-9]{0,19}$ ]]; then
  printf 'CJ media replay arguments rejected.\n' >&2; exit 2
fi
run_id=$1
prod=/root/trbhh
base=/root/trbhh-release-backups
source_backup=$base/finance-38392214806
scratch=$base/cj-media-replay-$run_id
reader=trbhh-cj-media-replay-$run_id
baseline=c37790f2e08d0907cd5c2ff2d091e698a2e2c65e
[[ "$(realpath "$prod")" == "$prod" && "$(realpath "$base")" == "$base" && "$(realpath "$source_backup")" == "$source_backup" ]]
[[ ! -e "$scratch" && ! -L "$scratch" ]]
[[ -f "$source_backup/legacy.tar.gz" && ! -L "$source_backup/legacy.tar.gz" && "$(stat -c %h "$source_backup/legacy.tar.gz")" == 1 ]]
[[ "$(realpath "$source_backup/legacy.tar.gz")" == "$source_backup/legacy.tar.gz" ]]
cd "$prod"
[[ "$(git rev-parse HEAD)" == "$baseline" ]]
container=$(docker compose ps -q app)
[[ "$container" =~ ^[a-f0-9]{12,64}$ && "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
image=$(docker inspect -f '{{.Image}}' "$container")
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$image" == "$(cat "$source_backup/image-id.txt")" ]]
[[ $(df -B1 --output=avail "$base" | tail -1) -gt 30000000000 ]]
if docker inspect "$reader" >/dev/null 2>&1; then exit 1; fi
mkdir -m 700 "$scratch" "$scratch/extracted"
[[ "$(realpath "$scratch")" == "$scratch" && ! -L "$scratch" ]]
exec 3>&1 4>&2
exec > "$scratch/operations.log" 2>&1
success=0
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$(docker inspect -f '{{index .Config.Labels "trbhh.cj-media-replay"}}' "$reader" 2>/dev/null)" == "$run_id" ]]; then docker rm -f "$reader" >/dev/null 2>&1 || result=1; fi
  if [[ "$result" == 0 ]]; then
    if [[ "$(realpath "$scratch")" == "$scratch" && "$(realpath "$scratch/extracted")" == "$scratch/extracted" && ! -L "$scratch/extracted" ]]; then
      rm -rf -- "$scratch/extracted" || result=1
    else
      result=1
    fi
  fi
  if [[ "$result" != 0 ]]; then printf 'CJ media replay failed; private diagnostics retained; no production operation was requested.\n' >&4; fi
  if [[ "$result" == 0 && "$success" == 1 ]]; then
    printf '{"archiveReplaySucceeded":true,"entries":10111,"files":9777,"directories":334,"baselineUnchanged":true,"backupMarkedVerified":false}\n' >&3
  fi
  exit "$result"
}
trap cleanup EXIT
source_identity=$(stat -c '%d:%i:%s:%Y' "$source_backup/legacy.tar.gz")
timeout 600s docker run --rm -i --name "$reader" --label "trbhh.cj-media-replay=$run_id" \
  --network none --user 0 --read-only --memory=768m --cpus=1 --pids-limit=64 \
  --mount "type=bind,src=$scratch/extracted,dst=/restore" \
  --entrypoint tar "$image" -xzf - -C /restore --no-same-owner --keep-old-files < "$source_backup/legacy.tar.gz"
[[ "$(stat -c '%d:%i:%s:%Y' "$source_backup/legacy.tar.gz")" == "$source_identity" ]]
node - "$scratch/extracted" > "$scratch/counts.json" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const root=process.argv[2];let entries=0,files=0,directories=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);entries++;if(item.isDirectory()){directories++;walk(file);}else if(item.isFile()){files++;}else throw Error('unexpected_archive_entry');}}
walk(root);if(entries!==10111||directories!==334||files!==9777)throw Error('entry_count_mismatch');console.log(JSON.stringify({entries,files,directories}));
NODE
[[ "$(git rev-parse HEAD)" == "$baseline" && "$(docker compose ps -q app)" == "$container" && "$(docker inspect -f '{{.Image}} {{.State.Running}} {{.State.Paused}}' "$container")" == "$image true false" ]]
success=1
