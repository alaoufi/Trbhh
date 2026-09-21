#!/usr/bin/env bash
# Stdin is the reviewed bundled operation with a public report encryption key.
set -euo pipefail
candidate=${1:?candidate SHA}
backup_id=${2:?verified backup ID}
release_profile=${3:-merchant_oauth}
[[ "$candidate" =~ ^[a-f0-9]{40}$ && "$backup_id" =~ ^[0-9]+$ ]]
if [[ "$release_profile" == national_day ]]; then
  [[ "$candidate" == 9a64552faca2b99e63a0e915ea73fd0989336b86 && "$backup_id" == 35629850346 ]]
  baseline=6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb
elif [[ "$release_profile" == merchant_oauth ]]; then
  baseline=07d2e9ead8e0b28824102d5c8a31b097e01f9459
else
  exit 1
fi
cd /root/trbhh
backup="/root/trbhh-release-backups/audit-$backup_id"
[[ -d "$backup" && ! -L "$backup" && "$(realpath "$backup")" == "$backup" ]]
[[ "$(git rev-parse HEAD)" == "$candidate" ]]
[[ "$(cat "$backup/VERIFIED")" == "$baseline" && "$(cat "$backup/commit.txt")" == "$baseline" ]]
[[ "$(cat "$backup/candidate.txt")" == "$candidate" && "$(cat "$backup/DEPLOYMENT_VERIFIED")" == "$candidate" ]]
container=$(docker compose ps -q app)
[[ -n "$container" && "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
expected=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]; if(!c.Id||!c.Image)process.exit(1);process.stdout.write(c.Id+" "+c.Image)' "$backup/container-after.json")
[[ "$(docker inspect -f '{{.Id}} {{.Image}}' "$container")" == "$expected" ]]
docker compose exec -T app node -
