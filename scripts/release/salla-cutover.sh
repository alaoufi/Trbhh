#!/usr/bin/env bash
# Only launched by the bounded systemd activation unit, never by the workflow directly.
set -Eeuo pipefail
umask 077
id=${1:?backup id}; candidate=${2:?candidate}
[[ "$id" =~ ^[0-9]+$ && "$candidate" =~ ^[0-9a-f]{40}$ ]] || exit 1
tools=$(cd "$(dirname "$0")" && pwd -P)
backup="/root/trbhh-release-backups/audit-$id"
image="trbhh-salla:$candidate"
schema_container="trbhh-salla-schema-$id"
check_cancelled() { [[ ! -e "$backup/ACTIVATION_CANCELLED" ]]; }
check_cancelled
[[ "$(cat "$backup/ACTIVATION_STARTED")" == "$candidate" ]] || exit 1
network=$(cat "$backup/network.txt")
[[ "$network" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 1
cd /root/trbhh
docker compose stop app
check_cancelled
docker run --name "$schema_container" --rm -i --network "$network" --add-host host.docker.internal:host-gateway --env-file "$backup/reader.env" --entrypoint node "$image" - apply < "$tools/supplier-schema-proof.cjs"
check_cancelled
git switch --detach "$candidate"
cp "$backup/runtime-twa-manifest.json" apps/android-twa/twa-manifest.json
temporary=$(mktemp /root/trbhh/.env.salla.XXXXXXXX)
install -m 600 "$backup/salla-staged.env" "$temporary"
check_cancelled
mv -T "$temporary" .env
printf 'services:\n  app:\n    image: %s\n' "$image" > "$backup/candidate-image.yml"
check_cancelled
docker compose -f docker-compose.yml -f "$backup/candidate-image.yml" up -d --no-build --pull never --no-deps --force-recreate app
ready=0
for attempt in $(seq 1 45); do
 check_cancelled
 if curl --fail --silent --max-time 5 https://trbhh.sa/login >/dev/null; then ready=1; break; fi
 sleep 2
done
[[ "$ready" == 1 ]] || exit 1
active_container=$(docker compose ps -q app)
[[ "$(docker inspect -f '{{.Image}}' "$active_container")" == "$(docker image inspect -f '{{.Id}}' "$image")" ]] || exit 1
docker exec "$active_container" node -e 'if(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=="false"||process.env.SUPPLIER_PUBLIC_ORIGIN!=="https://trbhh.sa")process.exit(1)'
for route in / /login /shop /guide; do
  [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 "https://trbhh.sa$route")" == 200 ]] || exit 1
done
check_cancelled
bash "$tools/safeguards.sh" after "$id" "$candidate" '' salla
check_cancelled
touch "$backup/ACTIVATION_CHILD_VERIFIED"
