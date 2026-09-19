#!/usr/bin/env bash
# Private, fail-closed production backup and post-release preservation checks.
set -Eeuo pipefail
trap 'printf "Safeguard stopped at line %s. Production deployment has not been performed by this workflow.\\n" "$LINENO" >&2' ERR
umask 077
phase=${1:?before or after}
backup_id=${2:?numeric backup run id}
candidate=${3:?candidate commit}
[[ "$phase" == before || "$phase" == after ]] || exit 1
[[ "$backup_id" =~ ^[0-9]+$ && "$candidate" =~ ^[0-9a-f]{40}$ ]] || exit 1
prod=/root/trbhh
base=/root/trbhh-release-backups
backup="$base/audit-$backup_id"
tools_dir=$(cd "$(dirname "$0")" && pwd -P)
[[ "$(realpath "$prod")" == "$prod" && ! -L "$base" ]] || { echo 'Unexpected production or backup path; review required'; exit 1; }
mkdir -p "$base"
chmod 700 "$base"
[[ "$(realpath "$base")" == "$base" ]] || exit 1
cd "$prod"
runtime_manifest=apps/android-twa/twa-manifest.json
changed_files=$(git diff --name-only)
if ! git diff --cached --quiet || [[ -n "$changed_files" && "$changed_files" != "$runtime_manifest" ]]; then
  echo 'Production has unexpected tracked local changes; preserved for review before release.'
  git diff --stat
  git diff --cached --stat
  exit 1
fi
container=$(docker compose ps -q app)
[[ -n "$container" && "$(docker inspect -f '{{.State.Running}}' "$container")" == true ]] || { echo 'Production app container is not running'; exit 1; }
current_commit=$(git rev-parse HEAD)
current_image=$(docker inspect -f '{{.Image}}' "$container")

if [[ "$phase" == after ]]; then
  [[ -f "$backup/VERIFIED" && ! -L "$backup" ]] || exit 1
  [[ "$current_commit" == "$candidate" ]] || { echo 'Candidate is not checked out on production'; exit 1; }
  [[ "$current_image" != "$(cat "$backup/image-id.txt")" ]] || { echo 'Production is still running the old image'; exit 1; }
  [[ ! -L "$runtime_manifest" && -f "$backup/runtime-twa-manifest.json" ]] || exit 1
  cp "$backup/runtime-twa-manifest.json" "$runtime_manifest"
  cmp --silent "$runtime_manifest" "$backup/runtime-twa-manifest.json"
  cmp --silent .env "$backup/environment.env"
  cmp --silent docker-compose.yml "$backup/docker-compose.yml"
  docker compose exec -T app node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/after.json"
  node "$tools_dir/database-proof.cjs" verify "$backup/before.json" "$backup/after.json"
  docker compose exec -T app node - verify-schema < "$tools_dir/database-proof.cjs"
  docker inspect "$container" > "$backup/container-after.json"
  node "$tools_dir/verify-runtime.cjs" "$backup/container-before.json" "$backup/container-after.json"
  for media in storage legacy; do
    [[ -f "$backup/$media.path" ]] || continue
    media_path=$(cat "$backup/$media.path")
    docker exec -i -u 0 "$container" node - snapshot "$media_path" < "$tools_dir/media-proof.cjs" > "$backup/$media-after.json"
    node "$tools_dir/media-proof.cjs" verify "$backup/$media-before.json" "$backup/$media-after.json"
  done
  printf 'Verified production commit %s; existing records, credentials, mounts and archived media preserved.\n' "$candidate"
  printf '%s\n' "$candidate" > "$backup/DEPLOYMENT_VERIFIED"
  exit 0
fi

[[ "$current_commit" == ec75f2862079107c742d8b8d903c24c5da5748da ]] || { echo 'Production baseline changed; stop and review'; exit 1; }
[[ ! -e "$backup" && ! -L "$backup" ]] || { echo 'Backup destination already exists; use a new run'; exit 1; }
mkdir -m 700 "$backup"
printf '%s\n' "$current_commit" > "$backup/commit.txt"
printf '%s\n' "$current_image" > "$backup/image-id.txt"
printf '%s\n' "$candidate" > "$backup/candidate.txt"
docker inspect "$container" > "$backup/container-before.json"
cp .env "$backup/environment.env"
cp docker-compose.yml "$backup/docker-compose.yml"
[[ -f "$runtime_manifest" && ! -L "$runtime_manifest" ]] || exit 1
cp "$runtime_manifest" "$backup/runtime-twa-manifest.json"
git diff --binary -- "$runtime_manifest" > "$backup/runtime-twa-manifest.patch"
docker compose config > "$backup/compose-resolved.yml"
git archive --format=tar "$current_commit" | gzip > "$backup/code.tar.gz"
docker tag "$current_image" "trbhh-rollback:audit-$backup_id"
docker image save "$current_image" | gzip > "$backup/image.tar.gz"
gzip -t "$backup/code.tar.gz" "$backup/image.tar.gz"

reader="trbhh-backup-reader-$backup_id"
watchdog="trbhh-backup-resume-$backup_id"
paused=0
resume_production() {
  if [[ "$paused" == 1 ]]; then docker unpause "$container" >/dev/null || true; fi
  if [[ "$(docker inspect -f '{{index .Config.Labels "trbhh.backup-reader"}}' "$reader" 2>/dev/null || true)" == "$backup_id" ]]; then docker rm -f "$reader" >/dev/null || true; fi
  # Keep the watchdog armed unless the app is confirmed unpaused and running.
  if [[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container" 2>/dev/null || true)" == 'true false' ]]; then
    systemctl stop "$watchdog.timer" >/dev/null 2>&1 || true
  fi
}
trap resume_production EXIT
# The helper runs no app startup or schema-sync and mounts production media RO.
node -e 'const fs=require("fs"),c=JSON.parse(fs.readFileSync(process.argv[1]))[0];if(c.Config.Env.some(v=>/[\r\n]/.test(v)))process.exit(1);fs.writeFileSync(process.argv[2],c.Config.Env.join("\n")+"\n",{mode:0o600});const n=Object.keys(c.NetworkSettings.Networks);if(n.length!==1)process.exit(1);process.stdout.write(n[0]);' "$backup/container-before.json" "$backup/reader.env" > "$backup/network.txt"
network=$(cat "$backup/network.txt")
[[ "$network" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 1
docker run -d --name "$reader" --label "trbhh.backup-reader=$backup_id" --network "$network" \
  --add-host host.docker.internal:host-gateway --env-file "$backup/reader.env" \
  --volumes-from "$container:ro" --entrypoint sleep "$current_image" infinity >/dev/null
docker exec "$reader" sh -c 'command -v mysqldump || command -v mariadb-dump' >/dev/null
# Independent time-bound resume survives SSH disconnects or a killed shell.
systemd-run --unit="$watchdog" --on-active=15m /bin/sh -c 'touch "$1"; exec /usr/bin/docker unpause "$2"' sh "$backup/WATCHDOG_FIRED" "$container" >/dev/null
paused=1
docker pause "$container" >/dev/null
echo 'Maintenance backup started; automatic resume guard armed.'
echo 'Taking a private snapshot from the live app database connection.'
docker exec -i "$reader" node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/before.json"
docker exec -i "$reader" node - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-before.json"
node "$tools_dir/database-proof.cjs" summary "$backup/before.json"
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1])); if(p.nonTransactionalTables.length) {console.error("Non-transactional tables require a different consistent backup method"); process.exit(1)}; if(p.controls.archiveAutoDeleteEnabled && p.controls.expiredArchivedCandidates > 0) {console.error("Pending automatic deletion requires review before release"); process.exit(1)}' "$backup/before.json"
docker exec -i "$reader" node - dump < "$tools_dir/database-proof.cjs" | gzip > "$backup/database.sql.gz"
gzip -t "$backup/database.sql.gz"
[[ $(stat -c %s "$backup/database.sql.gz") -gt 1000 ]] || exit 1

for spec in 'storage:STORAGE_DIR:/app/storage' 'legacy:LEGACY_LOCAL_DIR:'; do
  IFS=: read -r label env_name fallback <<< "$spec"
  media_path=$(docker exec "$reader" node -e 'process.stdout.write(process.env[process.argv[1]]||process.argv[2]||"")' "$env_name" "$fallback")
  [[ -n "$media_path" ]] || continue
  [[ "$media_path" == /app/storage || "$media_path" == /app/legacy ]] || { echo 'Unexpected media path; review before backup'; exit 1; }
  printf '%s\n' "$media_path" > "$backup/$label.path"
  docker exec -u 0 "$reader" tar -czf - -C "$media_path" . > "$backup/$label.tar.gz"
  gzip -t "$backup/$label.tar.gz"
  mkdir -m 700 "$backup/$label-extracted"
  tar -xzf "$backup/$label.tar.gz" -C "$backup/$label-extracted" --no-same-owner
  node "$tools_dir/media-proof.cjs" snapshot "$backup/$label-extracted" > "$backup/$label-before.json"
  docker exec -i -u 0 "$reader" node - snapshot "$media_path" < "$tools_dir/media-proof.cjs" > "$backup/$label-current.json"
  node "$tools_dir/media-proof.cjs" verify "$backup/$label-before.json" "$backup/$label-current.json"
done

# Restore into a disposable database with no production network or exposed ports.
restore_name="trbhh-restore-$backup_id"
restore_network="trbhh-restore-$backup_id"
restore_password=$(openssl rand -hex 24)
restore_database=$(docker exec "$reader" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')
[[ "$restore_database" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Unsupported restore database name'; exit 1; }
cleanup_restore() {
  if [[ "$(docker inspect -f '{{index .Config.Labels "trbhh.release-verification"}}' "$restore_name" 2>/dev/null || true)" == "$backup_id" ]]; then
    docker rm -fv "$restore_name" >/dev/null
  fi
  if [[ "$(docker network inspect -f '{{index .Labels "trbhh.release-verification"}}' "$restore_network" 2>/dev/null || true)" == "$backup_id" ]]; then
    docker network rm "$restore_network" >/dev/null
  fi
}
trap 'cleanup_restore || true; resume_production' EXIT
docker network create --internal --label "trbhh.release-verification=$backup_id" "$restore_network" >/dev/null
docker run -d --name "$restore_name" --label "trbhh.release-verification=$backup_id" \
  --network "$restore_network" --memory=1g --cpus=1 \
  -e MYSQL_ROOT_PASSWORD="$restore_password" -e MYSQL_ROOT_HOST=% -e MYSQL_DATABASE="$restore_database" \
  mysql:8.0 --innodb-buffer-pool-size=128M --event-scheduler=OFF >/dev/null
ready=0
for attempt in $(seq 1 90); do
  if docker exec -e MYSQL_PWD="$restore_password" "$restore_name" mysql -h127.0.0.1 -uroot -e 'SELECT 1' "$restore_database" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'Isolated restore database did not become ready'; exit 1; }
gzip -dc "$backup/database.sql.gz" | docker exec -i -e MYSQL_PWD="$restore_password" "$restore_name" \
  mysql --binary-mode=1 -uroot "$restore_database" > "$backup/restore.log" 2>&1
docker run --rm -i --network "$restore_network" --memory=768m --cpus=1 \
  -e "DATABASE_URL=mysql://root:$restore_password@$restore_name:3306/$restore_database" \
  --entrypoint node "$current_image" - snapshot < "$tools_dir/database-proof.cjs" > "$backup/restored.json"
node "$tools_dir/database-proof.cjs" verify-restore "$backup/before.json" "$backup/restored.json"
docker run --rm -i --network "$restore_network" --memory=768m --cpus=1 \
  -e "DATABASE_URL=mysql://root:$restore_password@$restore_name:3306/$restore_database" \
  --entrypoint node "$current_image" - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-restored.json"
node "$tools_dir/database-proof.cjs" verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"
# Reject concurrent external writers or a watchdog-resumed app; never weaken proof.
[[ "$(docker inspect -f '{{.State.Paused}}' "$container")" == true ]] || exit 1
docker exec -i "$reader" node - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-current.json"
node "$tools_dir/database-proof.cjs" verify-restore-full "$backup/full-before.json" "$backup/full-current.json"
[[ ! -e "$backup/WATCHDOG_FIRED" && "$(docker inspect -f '{{.State.Paused}}' "$container")" == true ]] || exit 1
docker unpause "$container" >/dev/null
[[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]] || exit 1
paused=0
systemctl stop "$watchdog.timer"
systemctl stop "$watchdog.service" >/dev/null 2>&1 || true
[[ ! -e "$backup/WATCHDOG_FIRED" ]] || exit 1
(cd "$backup" && sha256sum database.sql.gz *.tar.gz > SHA256SUMS)
printf '%s\n' "$current_commit" > "$backup/VERIFIED"
printf 'BACKUP_ID=%s\nROLLBACK_COMMIT=%s\nPrivate backup restored and verified successfully.\n' "$backup_id" "$current_commit"
