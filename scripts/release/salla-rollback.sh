#!/usr/bin/env bash
# Explicit application-only rollback. Never restores/drops the live database.
set -Eeuo pipefail
umask 077
id=${1:?verified backup id}; candidate=${2:?exact activated candidate sha}
reason=${3:-manual}
[[ "$reason" == manual || "$reason" == failure || "$reason" == watchdog ]] || exit 1
[[ "$id" =~ ^[0-9]+$ && "$candidate" =~ ^[0-9a-f]{40}$ ]] || exit 1
backup="/root/trbhh-release-backups/audit-$id"
[[ ! -L /root/trbhh && ! -L /root/trbhh-release-backups && ! -L "$backup" && "$(realpath "$backup")" == "$backup" ]] || exit 1
[[ "$(cat "$backup/VERIFIED")" == eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96 && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
tools=$(cd "$(dirname "$0")" && pwd -P)
unit="trbhh-salla-activation-$id"
schema_container="trbhh-salla-schema-$id"
source "$tools/salla-coordination.sh"
exec 9> "$backup/coordinator.lock"
flock -x 9
if [[ "$reason" != manual && -e "$backup/ACTIVATION_SUCCEEDED" ]]; then exit 0; fi
if [[ "$reason" == watchdog ]]; then touch "$backup/ACTIVATION_WATCHDOG_FIRED"; fi
salla_restore() {
cd /root/trbhh
head=$(git rev-parse HEAD)
[[ ( "$head" == "$candidate" || "$head" == eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96 ) && ! -L .env && ! -L docker-compose.yml ]] || exit 1
image=$(cat "$backup/image-id.txt")
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
docker image inspect "$image" >/dev/null
project=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]))[0];process.stdout.write(c.Config.Labels["com.docker.compose.project"]||"")' "$backup/container-before.json")
[[ "$project" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
# Preserve failed configuration separately; repeated rollback never overwrites evidence.
record=$(mktemp -d "$backup/rollback.XXXXXXXX")
cp .env "$record/failed.env"
cp docker-compose.yml "$record/failed-compose.yml"
printf 'services:\n  app:\n    image: %s\n' "$image" > "$record/override.yml"
install -m 600 "$backup/environment.env" "$record/environment.restore"
install -m 600 "$backup/docker-compose.yml" "$record/compose.restore"
env_temp=$(mktemp /root/trbhh/.env.salla-rollback.XXXXXXXX)
compose_temp=$(mktemp /root/trbhh/.compose.salla-rollback.XXXXXXXX)
install -m 600 "$record/environment.restore" "$env_temp"
install -m 600 "$record/compose.restore" "$compose_temp"
mv -T "$env_temp" .env
mv -T "$compose_temp" docker-compose.yml
docker compose -p "$project" -f "$backup/compose-resolved.yml" -f "$record/override.yml" up -d --no-build --pull never --no-deps --force-recreate app
container=$(docker compose -p "$project" -f "$backup/compose-resolved.yml" ps -q app)
[[ "$(docker inspect -f '{{.Image}}' "$container")" == "$image" && "$(docker inspect -f '{{.State.Running}}' "$container")" == true ]] || exit 1
printf 'Previous application image/config restored. Live database untouched. Candidate checkout retained for operator reconciliation.\n'
}
salla_cancel_and_restore
