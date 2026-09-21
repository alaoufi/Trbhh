#!/usr/bin/env bash
# Stdin is the reviewed bundled operation with a public report encryption key.
set -euo pipefail
candidate=${1:?candidate SHA}
backup_id=${2:?verified backup ID}
[[ "$candidate" =~ ^[a-f0-9]{40}$ && "$backup_id" =~ ^[0-9]+$ ]]
cd /root/trbhh
backup="/root/trbhh-release-backups/audit-$backup_id"
[[ -d "$backup" && ! -L "$backup" && "$(realpath "$backup")" == "$backup" ]]
[[ "$(git rev-parse HEAD)" == "$candidate" ]]
[[ "$(cat "$backup/VERIFIED")" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459 ]]
[[ "$(cat "$backup/candidate.txt")" == "$candidate" && "$(cat "$backup/DEPLOYMENT_VERIFIED")" == "$candidate" ]]
container=$(docker compose ps -q app)
[[ -n "$container" && "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
expected=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]; if(!c.Id||!c.Image)process.exit(1);process.stdout.write(c.Id+" "+c.Image)' "$backup/container-after.json")
[[ "$(docker inspect -f '{{.Id}} {{.Image}}' "$container")" == "$expected" ]]
docker compose exec -T app node -
