#!/usr/bin/env bash
# Run only under the shared vps-deploy lock after inspecting the serving service.
# Fresh private DB/code/image backup; verified retained media may be referenced.
# No deployment, schema migration or production restore.
set -Eeuo pipefail
umask 077
if [[ $# != 3 || ! ${1:-} =~ ^[1-9][0-9]{0,19}$ || ! ${2:-} =~ ^[0-9a-f]{40}$ || ! ${3:-} =~ ^[0-9a-f]{40}$ || ${2:-} == "${3:-}" ]]; then
  printf 'Finance backup arguments rejected. Expected RUN_ID CANDIDATE_SHA BASELINE_SHA.\n' >&2
  exit 2
fi
backup_id=$1; candidate=$2; baseline=$3
prod=/root/trbhh
base=/root/trbhh-release-backups
backup="$base/finance-$backup_id"
tools_dir=$(cd "$(dirname "$0")" && pwd -P)
stage=preflight; substep=preflight
exec 3>&1 4>&2
# Preflight failures report only their stage; Compose diagnostics can include
# private configuration. Later diagnostics have a protected log destination.
exec 2>/dev/null
trap 'printf "Finance backup failed at stage %s substep %s; no release verification was issued.\n" "$stage" "$substep" >&4' ERR
[[ "$(realpath "$prod")" == "$prod" && ! -L "$base" ]]
mkdir -p "$base"
chmod 700 "$base"
[[ "$(realpath "$base")" == "$base" && ! -e "$backup" && ! -L "$backup" ]]
for helper in database-proof.cjs media-proof.cjs backup-capacity-proof.cjs supplier-preservation-proof.cjs finance-media-reference.cjs merchant-media-reference.cjs; do
  [[ -f "$tools_dir/$helper" && ! -L "$tools_dir/$helper" ]]
done
cd "$prod"
[[ "$(git rev-parse HEAD)" == "$baseline" ]]
runtime_manifest=apps/android-twa/twa-manifest.json
changed_files=$(git diff --name-only)
git diff --cached --quiet
[[ -z "$changed_files" || "$changed_files" == "$runtime_manifest" ]]
for file in .env docker-compose.yml "$runtime_manifest"; do [[ -f "$file" && ! -L "$file" ]]; done
container=$(docker compose ps -q app)
[[ "$container" =~ ^[0-9a-f]{12,64}$ ]]
[[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container")" == app ]]
current_image=$(docker inspect -f '{{.Image}}' "$container")
[[ "$current_image" =~ ^sha256:[0-9a-f]{64}$ ]]

# Fresh media plus extraction, image/code, database restore, and OS reserves.
# A rejected capacity check creates no partial archive and never pauses the app.
stage=capacity
capacity=$(docker exec -i -u 0 "$container" node - measure < "$tools_dir/backup-capacity-proof.cjs")
image_bytes=$(docker image inspect -f '{{.Size}}' "$current_image")
code_bytes=$(git archive --format=tar "$baseline" | wc -c)
docker_root=$(docker info --format '{{.DockerRootDir}}')
# MEDIA_CAPACITY_BEGIN
media_capacity=fresh
media_parent="$base/audit-35603864905"
if node "$tools_dir/backup-capacity-proof.cjs" check "$capacity" "$image_bytes" "$code_bytes" "$base" "$docker_root" fresh >&3; then
  :
else
  # A verified full backup may supply identical legacy media in place. Mutable
  # storage remains freshly archived; each measured root keeps its own budget.
  # Database/code/image allocation and all reserves remain unchanged.
  stage=parent_media
  node "$tools_dir/finance-media-reference.cjs" inspect "$media_parent" >&3
  media_capacity=fresh-storage-retained-legacy
  node "$tools_dir/backup-capacity-proof.cjs" check "$capacity" "$image_bytes" "$code_bytes" "$base" "$docker_root" "$media_capacity" >&3
fi
# MEDIA_CAPACITY_END
mkdir -m 700 "$backup"
# All raw command diagnostics, SQL, configuration and manifests remain private.
exec >> "$backup/operations.log" 2>&1
printf '%s\n' "$capacity" > "$backup/capacity.json"
printf '%s\n' "$media_capacity" > "$backup/media-mode.txt"
printf '%s\n' "$baseline" > "$backup/commit.txt"
printf '%s\n' "$candidate" > "$backup/candidate.txt"
printf '%s\n' "$current_image" > "$backup/image-id.txt"
printf '%s\n' "$container" > "$backup/container-id.txt"
docker inspect "$container" > "$backup/container-before.json"
if [[ "$media_capacity" == fresh-storage-retained-legacy ]]; then node "$tools_dir/finance-media-reference.cjs" prepare-legacy "$media_parent" "$backup"; fi
cp .env "$backup/environment.env"
cp docker-compose.yml "$backup/docker-compose.yml"
cp "$runtime_manifest" "$backup/runtime-twa-manifest.json"
git diff --binary -- "$runtime_manifest" > "$backup/runtime-twa-manifest.patch"
docker compose config > "$backup/compose-resolved.yml"

# Also retain exact Compose source files from the live container's labels.
# These can include a prior release's image override outside the checkout.
node - "$backup" "$prod" "$base" <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const [backup,prod,base]=process.argv.slice(2),c=JSON.parse(fs.readFileSync(path.join(backup,'container-before.json')))[0];
const labels=c.Config.Labels||{},files=(labels['com.docker.compose.project.config_files']||'').split(',');
if(labels['com.docker.compose.project.working_dir']!==prod||!files.length||files.some(f=>!f))throw Error('compose_identity');
const sourceFiles=files.map((file,index)=>{
  if(!path.isAbsolute(file)||![prod,base].some(root=>file.startsWith(root+'/'))||fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile())throw Error('compose_source');
  const saved=`compose-source-${index}.yml`;fs.copyFileSync(file,path.join(backup,saved));return {source:file,saved};
});
fs.writeFileSync(path.join(backup,'compose-sources.json'),JSON.stringify({project:labels['com.docker.compose.project'],service:'app',sourceFiles})+'\n',{mode:0o600});
if(c.Config.Env.some(v=>/[\r\n]/.test(v)))throw Error('runtime_environment');
fs.writeFileSync(path.join(backup,'reader.env'),c.Config.Env.join('\n')+'\n',{mode:0o600});
const networks=Object.keys(c.NetworkSettings.Networks);if(networks.length!==1||!/^[A-Za-z0-9_.-]+$/.test(networks[0]))throw Error('runtime_network');
fs.writeFileSync(path.join(backup,'network.txt'),networks[0]+'\n',{mode:0o600});
NODE
network=$(cat "$backup/network.txt")
reader="trbhh-finance-reader-$backup_id"
restore_name="trbhh-finance-restore-$backup_id"
restore_network="trbhh-finance-restore-$backup_id"
watchdog="trbhh-finance-resume-$backup_id"
paused=0

# CLEANUP_BEGIN
cleanup() {
  local result=$?
  trap - EXIT
  set +e
  # Resume first, including any failing dump/restore/SSH termination path.
  if [[ "$paused" == 1 ]]; then docker unpause "$container" >/dev/null 2>&1; fi
  if [[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container" 2>/dev/null)" == 'true false' ]]; then
    systemctl stop "$watchdog.timer" >/dev/null 2>&1
  else
    # Preserve all diagnostic resources and the independent timer when normal
    # resume fails. Never declare success or disarm recovery in this state.
    printf 'Finance backup failed at stage %s substep %s; resume remains guarded.\n' "$stage" "$substep" >&4
    exit 1
  fi
  if [[ "$(docker inspect -f '{{index .Config.Labels "trbhh.finance-backup"}}' "$restore_name" 2>/dev/null)" == "$backup_id" ]]; then
    docker rm -fv "$restore_name" >/dev/null 2>&1 || result=1
  fi
  if [[ "$(docker network inspect -f '{{index .Labels "trbhh.finance-backup"}}' "$restore_network" 2>/dev/null)" == "$backup_id" ]]; then
    docker network rm "$restore_network" >/dev/null 2>&1 || result=1
  fi
  if [[ "$(docker inspect -f '{{index .Config.Labels "trbhh.finance-backup"}}' "$reader" 2>/dev/null)" == "$backup_id" ]]; then
    docker rm -f "$reader" >/dev/null 2>&1 || result=1
  fi
  if [[ "$result" == 0 && "$stage" == complete ]]; then seal_backup || result=1; fi
  if [[ "$result" != 0 ]]; then printf 'Finance backup failed at stage %s substep %s; no release verification was issued.\n' "$stage" "$substep" >&4; fi
  exit "$result"
}
# CLEANUP_END
trap - ERR
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stage=archives; substep=archive_code
git archive --format=tar "$baseline" | gzip > "$backup/code.tar.gz"
substep=archive_image
docker tag "$current_image" "trbhh-rollback:finance-$backup_id"
docker image save "$current_image" | gzip > "$backup/image.tar.gz"
substep=verify_archives
gzip -t "$backup/code.tar.gz" "$backup/image.tar.gz"
# Pull/resolve the isolated restore image before the guarded pause.
if ! docker image inspect mysql:8.0 >/dev/null 2>&1; then docker pull mysql:8.0 >/dev/null; fi
restore_image=$(docker image inspect -f '{{.Id}}' mysql:8.0)
[[ "$restore_image" =~ ^sha256:[0-9a-f]{64}$ ]]
printf '%s\n' "$restore_image" > "$backup/restore-image-id.txt"
docker run -d --name "$reader" --label "trbhh.finance-backup=$backup_id" \
  --network "$network" --add-host host.docker.internal:host-gateway \
  --env-file "$backup/reader.env" --volumes-from "$container:ro" \
  --memory=768m --cpus=1 --pids-limit=128 --entrypoint sleep "$current_image" infinity >/dev/null
docker exec "$reader" sh -c 'command -v mysqldump || command -v mariadb-dump' >/dev/null
restore_database=$(docker exec "$reader" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')
[[ "$restore_database" =~ ^[A-Za-z0-9_]+$ ]]

# Archive media while live, then prove exact current bytes under the pause.
# Extract only in a networkless, read-only container with one scratch mount;
# archive symlinks can never escape to the host or production mounts.
# MEDIA_ARCHIVES_BEGIN
for spec in 'storage:STORAGE_DIR:/app/storage' 'legacy:LEGACY_LOCAL_DIR:'; do
  IFS=: read -r label env_name fallback <<< "$spec"
  media_path=$(docker exec "$reader" node -e 'process.stdout.write(process.env[process.argv[1]]||process.argv[2]||"")' "$env_name" "$fallback")
  if [[ -z "$media_path" ]]; then [[ ! -e "$backup/$label.path" ]]; continue; fi
  [[ "$media_path" == "/app/$label" ]]
  if [[ "$media_capacity" == fresh-storage-retained-legacy && "$label" == legacy ]]; then
    [[ -f "$backup/$label.path" && -f "$backup/$label-before.json" && "$(cat "$backup/$label.path")" == "$media_path" ]]
    continue
  fi
  printf '%s\n' "$media_path" > "$backup/$label.path"
  docker exec -u 0 "$reader" tar -czf - -C "$media_path" . > "$backup/$label.tar.gz"
  gzip -t "$backup/$label.tar.gz"
  mkdir -m 700 "$backup/$label-extracted"
  docker run --rm -i --network none --user 0 --read-only --memory=768m --cpus=1 --pids-limit=64 \
    --mount "type=bind,src=$backup/$label-extracted,dst=/restore" \
    --entrypoint tar "$current_image" -xzf - -C /restore --no-same-owner --keep-old-files < "$backup/$label.tar.gz"
  node "$tools_dir/media-proof.cjs" snapshot "$backup/$label-extracted" > "$backup/$label-before.json"
done
# MEDIA_ARCHIVES_END

stage=snapshot; substep=snapshot_arm_watchdog
# Timer survives a killed shell. A fired timer invalidates this backup proof.
systemd-run --unit="$watchdog" --on-active=15m /bin/sh -c 'touch "$1"; exec /usr/bin/docker unpause "$2"' sh "$backup/WATCHDOG_FIRED" "$container" >/dev/null
paused=1
substep=snapshot_pause_app
docker pause "$container" >/dev/null
substep=snapshot_verify_paused
[[ "$(docker inspect -f '{{.State.Paused}}' "$container")" == true ]]
substep=snapshot_protected_database
docker exec -i "$reader" node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/before.json"
substep=snapshot_full_database
docker exec -i "$reader" node - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-before.json"
substep=snapshot_supplier_data
docker exec -i "$reader" node - snapshot < "$tools_dir/supplier-preservation-proof.cjs" > "$backup/supplier-before.json"
substep=snapshot_database_invariants
node - "$backup/before.json" <<'NODE'
const p=JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if(p.nonTransactionalTables.length||(p.controls.archiveAutoDeleteEnabled&&p.controls.expiredArchivedCandidates>0))process.exit(1);
NODE
docker exec -i "$reader" node - dump < "$tools_dir/database-proof.cjs" | gzip > "$backup/database.sql.gz"
substep=snapshot_validate_database_dump
gzip -t "$backup/database.sql.gz"
[[ $(stat -c %s "$backup/database.sql.gz") -gt 1000 ]]
for label in storage legacy; do
  [[ -f "$backup/$label.path" ]] || continue
  substep=snapshot_media_verify_${label}
  media_path=$(cat "$backup/$label.path")
  docker exec -i -u 0 "$reader" node - snapshot "$media_path" < "$tools_dir/media-proof.cjs" > "$backup/$label-current.json"
  node "$tools_dir/media-proof.cjs" verify "$backup/$label-before.json" "$backup/$label-current.json"
  node "$tools_dir/media-proof.cjs" verify "$backup/$label-current.json" "$backup/$label-before.json"
done
if [[ "$media_capacity" == fresh-storage-retained-legacy ]]; then substep=snapshot_parent_media_verify; node "$tools_dir/finance-media-reference.cjs" verify-current "$backup"; fi
# Detect other writers or a prematurely resumed app during the backup window.
substep=snapshot_concurrent_writer_check
docker exec -i "$reader" node - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-current.json"
substep=snapshot_database_equality_check
node "$tools_dir/database-proof.cjs" verify-restore-full "$backup/full-before.json" "$backup/full-current.json"
substep=snapshot_watchdog_check
[[ ! -e "$backup/WATCHDOG_FIRED" && "$(docker inspect -f '{{.State.Paused}}' "$container")" == true ]]
# RESUME_BEFORE_RESTORE: the immutable dump is now independent of live traffic.
docker unpause "$container" >/dev/null
[[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
paused=0
systemctl stop "$watchdog.timer"
systemctl stop "$watchdog.service" >/dev/null 2>&1 || true
[[ ! -e "$backup/WATCHDOG_FIRED" ]]

stage=restore
restore_password=$(openssl rand -hex 24)
printf 'MYSQL_ROOT_PASSWORD=%s\nMYSQL_ROOT_HOST=%%\nMYSQL_DATABASE=%s\n' "$restore_password" "$restore_database" > "$backup/restore.env"
printf 'DATABASE_URL=mysql://root:%s@%s:3306/%s\n' "$restore_password" "$restore_name" "$restore_database" > "$backup/restore-reader.env"
docker network create --internal --label "trbhh.finance-backup=$backup_id" "$restore_network" >/dev/null
docker run -d --name "$restore_name" --label "trbhh.finance-backup=$backup_id" \
  --network "$restore_network" --memory=1g --cpus=1 --pids-limit=256 \
  --env-file "$backup/restore.env" "$restore_image" \
  --innodb-buffer-pool-size=128M --event-scheduler=OFF >/dev/null
ready=0
for attempt in $(seq 1 90); do
  if docker exec -e MYSQL_PWD="$restore_password" "$restore_name" mysql -h127.0.0.1 -uroot -e 'SELECT 1' "$restore_database" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]]
# The only SQL import targets this labelled disposable container, never the app.
gzip -dc "$backup/database.sql.gz" | docker exec -i -e MYSQL_PWD="$restore_password" "$restore_name" \
  mysql --binary-mode=1 -uroot "$restore_database" > "$backup/restore.log" 2>&1
for mode in snapshot snapshot-full; do
  destination=restored.json
  if [[ "$mode" == snapshot-full ]]; then destination=full-restored.json; fi
  docker run --rm -i --network "$restore_network" --memory=768m --cpus=1 --pids-limit=128 \
    --env-file "$backup/restore-reader.env" --entrypoint node "$current_image" - "$mode" \
    < "$tools_dir/database-proof.cjs" > "$backup/$destination"
done
node "$tools_dir/database-proof.cjs" verify-restore "$backup/before.json" "$backup/restored.json"
node "$tools_dir/database-proof.cjs" verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"
[[ "$(git rev-parse HEAD)" == "$baseline" ]]
[[ "$(docker compose ps -q app)" == "$container" && "$(docker inspect -f '{{.Image}}' "$container")" == "$current_image" ]]
[[ "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]]
cmp --silent .env "$backup/environment.env"
cmp --silent docker-compose.yml "$backup/docker-compose.yml"
cmp --silent "$runtime_manifest" "$backup/runtime-twa-manifest.json"
node - "$backup" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),dir=process.argv[2];
const sources=JSON.parse(fs.readFileSync(path.join(dir,'compose-sources.json')));
for(const file of sources.sourceFiles){if(fs.realpathSync(file.source)!==file.source||!fs.readFileSync(file.source).equals(fs.readFileSync(path.join(dir,file.saved))))process.exit(1);}
NODE
stage=seal
(cd "$backup" && sha256sum database.sql.gz *.tar.gz *.json *.txt *.env *.yml *.patch *.path > SHA256SUMS)
restored_tables=$(node - "$backup/full-restored.json" <<'NODE'
const p=JSON.parse(require('node:fs').readFileSync(process.argv[2]));
process.stdout.write(String(Object.keys(p.tables).length));
NODE
)
[[ "$restored_tables" =~ ^[1-9][0-9]*$ ]]
# Only the successful EXIT cleanup calls this, after confirming app resume and
# deleting its own disposable reader, database and internal network.
seal_backup() {
  if [[ "$media_capacity" == fresh-storage-retained-legacy ]]; then node "$tools_dir/finance-media-reference.cjs" verify "$backup" || return 1; fi
  printf '%s\n' "$baseline" > "$backup/VERIFIED" || return 1
  printf 'BACKUP_ID=%s\nROLLBACK_COMMIT=%s\nCANDIDATE_COMMIT=%s\nIMAGE_ID=%s\n' "$backup_id" "$baseline" "$candidate" "$current_image" >&3
  printf '{"restoredTables":%s,"verified":true}\n' "$restored_tables" >&3
}
stage=complete
