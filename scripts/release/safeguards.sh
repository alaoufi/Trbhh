#!/usr/bin/env bash
# Private, fail-closed production backup and post-release preservation checks.
set -Eeuo pipefail
trap 'printf "Safeguard stopped at line %s. Production deployment has not been performed by this workflow.\\n" "$LINENO" >&2' ERR
umask 077
phase=${1:?before or after}
backup_id=${2:?numeric backup run id}
candidate=${3:?candidate commit}
reuse_media_id=${4:-}
release_profile=${5:-standard}
[[ "$release_profile" == standard || "$release_profile" == salla || "$release_profile" == merchant_oauth || "$release_profile" == merchant_headers || "$release_profile" == supplier_selection || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty ]] || exit 1
[[ "$phase" == before || "$phase" == after ]] || exit 1
[[ "$backup_id" =~ ^[0-9]+$ && "$candidate" =~ ^[0-9a-f]{40}$ ]] || exit 1
if [[ "$release_profile" == national_day_loyalty ]]; then
  [[ "$reuse_media_id" == 35634930527 && "$reuse_media_id" != "$backup_id" ]] || { echo 'National Day loyalty release requires its exact verified media chain'; exit 1; }
elif [[ "$release_profile" == supplier_selection ]]; then
  [[ "$reuse_media_id" == 35607654850 && "$reuse_media_id" != "$backup_id" ]] || { echo 'Supplier selection requires its exact verified media chain'; exit 1; }
elif [[ "$release_profile" == public_home ]]; then
  [[ "$reuse_media_id" == 35619790007 && "$reuse_media_id" != "$backup_id" ]] || { echo 'Public home requires its exact reviewed media chain'; exit 1; }
elif [[ "$release_profile" == national_day_immersive ]]; then
  [[ "$reuse_media_id" == 35629850346 && "$reuse_media_id" != "$backup_id" ]] || { echo 'Immersive National Day requires its exact reviewed media chain'; exit 1; }
elif [[ "$release_profile" == national_day ]]; then
  [[ "$reuse_media_id" == 35626587686 && "$reuse_media_id" != "$backup_id" ]] || { echo 'National day requires its exact reviewed media chain'; exit 1; }
fi
if [[ -n "$reuse_media_id" ]]; then
  if [[ "$release_profile" == national_day_loyalty ]]; then
    [[ "$reuse_media_id" == 35634930527 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  elif [[ "$release_profile" == supplier_selection ]]; then
    [[ "$reuse_media_id" == 35607654850 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  elif [[ "$release_profile" == public_home ]]; then
    [[ "$reuse_media_id" == 35619790007 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  elif [[ "$release_profile" == national_day_immersive ]]; then
    [[ "$reuse_media_id" == 35629850346 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  elif [[ "$release_profile" == national_day ]]; then
    [[ "$reuse_media_id" == 35626587686 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  elif [[ "$release_profile" == merchant_headers ]]; then
    [[ "$reuse_media_id" == 35603864905 && "$reuse_media_id" != "$backup_id" ]] || exit 1
  else
    [[ "$phase" == before && "$reuse_media_id" =~ ^[0-9]+$ && "$reuse_media_id" != "$backup_id" ]] || exit 1
  fi
fi
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
  if [[ "$release_profile" == merchant_headers ]]; then
    [[ "$(cat "$backup/VERIFIED")" == 5f8dbc01c38bf431a9ae099a581b80536097b346 && "$(cat "$backup/commit.txt")" == 5f8dbc01c38bf431a9ae099a581b80536097b346 && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
    node "$tools_dir/merchant-media-reference.cjs" verify "$backup"
  fi
  [[ ! -L "$runtime_manifest" && -f "$backup/runtime-twa-manifest.json" ]] || exit 1
  cp "$backup/runtime-twa-manifest.json" "$runtime_manifest"
  cmp --silent "$runtime_manifest" "$backup/runtime-twa-manifest.json"
  if [[ "$release_profile" == salla ]]; then
    [[ "$(cat "$backup/commit.txt")" == eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96 && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
    node "$tools_dir/salla-environment.cjs" verify "$backup/environment.env" .env "$backup/docker-compose.yml" docker-compose.yml
    git show "$candidate:docker-compose.yml" | cmp --silent docker-compose.yml -
    docker compose exec -T app node < "$tools_dir/supplier-schema-proof.cjs"
  else
    cmp --silent .env "$backup/environment.env"
    cmp --silent docker-compose.yml "$backup/docker-compose.yml"
  fi
  if [[ "$release_profile" == merchant_oauth || "$release_profile" == merchant_headers || "$release_profile" == supplier_selection || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty ]]; then
    if [[ "$release_profile" == merchant_oauth ]]; then
      [[ "$(cat "$backup/VERIFIED")" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459 && "$(cat "$backup/commit.txt")" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459 && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
    elif [[ "$release_profile" == national_day_loyalty ]]; then
      [[ "$(cat "$backup/VERIFIED")" == a9f0c98731875ff95d451de5fe75ff42736ed01f && "$(cat "$backup/commit.txt")" == a9f0c98731875ff95d451de5fe75ff42736ed01f && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
      node "$tools_dir/loyalty-media-reference.cjs" verify "$backup"
    elif [[ "$release_profile" == national_day_immersive ]]; then
      [[ "$(cat "$backup/VERIFIED")" == 9a64552faca2b99e63a0e915ea73fd0989336b86 && "$(cat "$backup/commit.txt")" == 9a64552faca2b99e63a0e915ea73fd0989336b86 && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
      node "$tools_dir/immersive-media-reference.cjs" verify "$backup"
    elif [[ "$release_profile" == national_day ]]; then
      [[ "$(cat "$backup/VERIFIED")" == 6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb && "$(cat "$backup/commit.txt")" == 6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
      node "$tools_dir/national-media-reference.cjs" verify "$backup"
    elif [[ "$release_profile" == public_home ]]; then
      [[ "$(cat "$backup/VERIFIED")" == 1a2111ccd9a17c151a2f47cf793f3bddf4d0451f && "$(cat "$backup/commit.txt")" == 1a2111ccd9a17c151a2f47cf793f3bddf4d0451f && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
      node "$tools_dir/home-media-reference.cjs" verify "$backup"
    elif [[ "$release_profile" == supplier_selection ]]; then
      [[ "$(cat "$backup/VERIFIED")" == 415a8fe593522859f4cf85c2fa10e47a7d40109b && "$(cat "$backup/commit.txt")" == 415a8fe593522859f4cf85c2fa10e47a7d40109b && "$(cat "$backup/candidate.txt")" == "$candidate" ]] || exit 1
      if [[ -n "$reuse_media_id" ]]; then
        node "$tools_dir/selection-media-reference.cjs" verify "$backup"
      else
        [[ ! -e "$backup/REUSED_MEDIA_SOURCE" && ! -e "$backup/SELECTION_MEDIA_REFERENCE.json" ]] || exit 1
      fi
    fi
    # Finish preservation proof before issuing OAuth invitations or running sync.
    docker compose exec -T app node - snapshot < "$tools_dir/supplier-preservation-proof.cjs" > "$backup/supplier-after.json"
    node "$tools_dir/supplier-preservation-proof.cjs" verify "$backup/supplier-before.json" "$backup/supplier-after.json"
  fi
  docker compose exec -T app node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/after.json"
  node "$tools_dir/database-proof.cjs" verify "$backup/before.json" "$backup/after.json"
  docker compose exec -T app node - verify-schema < "$tools_dir/database-proof.cjs"
  docker inspect "$container" > "$backup/container-after.json"
  node "$tools_dir/verify-runtime.cjs" "$backup/container-before.json" "$backup/container-after.json" "$release_profile"
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

if [[ "$release_profile" == salla ]]; then
  [[ "$current_commit" == eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96 && -z "$reuse_media_id" ]] || { echo 'Salla requires exact home baseline and fresh full backup'; exit 1; }
elif [[ "$release_profile" == merchant_oauth ]]; then
  [[ "$current_commit" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459 && -z "$reuse_media_id" ]] || { echo 'Merchant OAuth requires its exact reviewed baseline and fresh full backup'; exit 1; }
elif [[ "$release_profile" == merchant_headers ]]; then
  [[ "$current_commit" == 5f8dbc01c38bf431a9ae099a581b80536097b346 && "$reuse_media_id" == 35603864905 ]] || { echo 'Merchant headers require the reviewed baseline and exact verified parent media backup'; exit 1; }
elif [[ "$release_profile" == supplier_selection ]]; then
  [[ "$current_commit" == 415a8fe593522859f4cf85c2fa10e47a7d40109b && "$reuse_media_id" == 35607654850 ]] || { echo 'Supplier selection requires its exact reviewed baseline and backup chain'; exit 1; }
elif [[ "$release_profile" == public_home ]]; then
  [[ "$current_commit" == 1a2111ccd9a17c151a2f47cf793f3bddf4d0451f && "$reuse_media_id" == 35619790007 ]] || { echo 'Public home requires its exact reviewed baseline and backup chain'; exit 1; }
elif [[ "$release_profile" == national_day_loyalty ]]; then
  [[ "$current_commit" == a9f0c98731875ff95d451de5fe75ff42736ed01f && "$reuse_media_id" == 35634930527 ]] || { echo 'National Day loyalty release requires its exact reviewed production baseline and backup chain'; exit 1; }
elif [[ "$release_profile" == national_day_immersive ]]; then
  [[ "$current_commit" == 9a64552faca2b99e63a0e915ea73fd0989336b86 && "$reuse_media_id" == 35629850346 ]] || { echo 'Immersive National Day requires its exact reviewed production baseline and backup chain'; exit 1; }
elif [[ "$release_profile" == national_day ]]; then
  [[ "$current_commit" == 6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb && "$reuse_media_id" == 35626587686 ]] || { echo 'National day requires its exact reviewed baseline and backup chain'; exit 1; }
else
  [[ "$current_commit" == 021c5fe43f9a6361f7a0df66bf35e92f38e0cf06 ]] || { echo 'Production baseline changed; stop and review'; exit 1; }
fi
if [[ "$release_profile" == merchant_oauth || "$release_profile" == merchant_headers || "$release_profile" == supplier_selection || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty ]]; then
  # Measure while the app is live, before creating this backup or its archives.
  # A failed capacity gate creates no partial image/media backup and never pauses.
  capacity=$(docker exec -i -u 0 "$container" node - measure < "$tools_dir/backup-capacity-proof.cjs")
  image_bytes=$(docker image inspect -f '{{.Size}}' "$current_image")
  code_bytes=$(git archive --format=tar "$current_commit" | wc -c)
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  media_capacity=fresh
  if [[ "$release_profile" == merchant_headers ]]; then media_capacity=verified-parent; fi
  if [[ "$release_profile" == supplier_selection && -n "$reuse_media_id" ]]; then media_capacity=verified-parent; fi
  if [[ "$release_profile" == public_home ]]; then media_capacity=verified-parent; fi
  if [[ "$release_profile" == national_day ]]; then media_capacity=verified-parent; fi
  if [[ "$release_profile" == national_day_immersive ]]; then media_capacity=verified-parent; fi
  if [[ "$release_profile" == national_day_loyalty ]]; then media_capacity=verified-parent; fi
  node "$tools_dir/backup-capacity-proof.cjs" check "$capacity" "$image_bytes" "$code_bytes" "$base" "$docker_root" "$media_capacity"
fi
[[ ! -e "$backup" && ! -L "$backup" ]] || { echo 'Backup destination already exists; use a new run'; exit 1; }
mkdir -m 700 "$backup"
printf '%s\n' "$current_commit" > "$backup/commit.txt"
printf '%s\n' "$current_image" > "$backup/image-id.txt"
printf '%s\n' "$candidate" > "$backup/candidate.txt"
docker inspect "$container" > "$backup/container-before.json"
if [[ "$release_profile" == merchant_oauth || "$release_profile" == merchant_headers || "$release_profile" == supplier_selection || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty ]]; then
  node "$tools_dir/verify-runtime.cjs" "$backup/container-before.json" "$backup/container-before.json" "$release_profile"
fi
if [[ "$release_profile" == national_day_loyalty ]]; then
  node "$tools_dir/loyalty-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
elif [[ "$release_profile" == merchant_headers ]]; then
  # Read/hash the verified private parent in place; no media archive copy or
  # extraction. Both checkpoint directories must remain retained for rollback.
  node "$tools_dir/merchant-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
  node "$tools_dir/verify-runtime.cjs" "$base/audit-$reuse_media_id/container-after.json" "$backup/container-before.json" merchant_headers
elif [[ "$release_profile" == national_day_immersive ]]; then
  node "$tools_dir/immersive-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
elif [[ "$release_profile" == national_day ]]; then
  node "$tools_dir/national-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
elif [[ "$release_profile" == public_home ]]; then
  # Fresh DB/code/image; the explicit reviewed checkpoint binds the retained
  # media to the exact current runtime without copying or extracting archives.
  node "$tools_dir/home-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
elif [[ "$release_profile" == supplier_selection && -n "$reuse_media_id" ]]; then
  # Full parent 35603864905 -> verified headers checkpoint 35607654850 -> this
  # fresh checkpoint. The helper proves exact images/runtime and all archives.
  node "$tools_dir/selection-media-reference.cjs" prepare "$base/audit-$reuse_media_id" "$backup"
fi
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
# Prepare reused media before the guarded pause. Merchant headers use only the
# pinned verified parent above; the older generic reuse path copies/extracts
# archives and does not reuse that source's manifests or success markers.
if [[ "$release_profile" == merchant_headers || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty || ( "$release_profile" == supplier_selection && -n "$reuse_media_id" ) ]]; then
  for spec in 'storage:STORAGE_DIR:/app/storage' 'legacy:LEGACY_LOCAL_DIR:'; do
    IFS=: read -r label env_name fallback <<< "$spec"
    media_path=$(docker exec "$reader" node -e 'process.stdout.write(process.env[process.argv[1]]||process.argv[2]||"")' "$env_name" "$fallback")
    if [[ -z "$media_path" ]]; then
      [[ ! -e "$backup/$label.path" ]] || { echo 'Parent media mount is no longer configured'; exit 1; }
      continue
    fi
    [[ "$media_path" == "/app/$label" && -f "$backup/$label.path" && -f "$backup/$label-before.json" && "$(cat "$backup/$label.path")" == "$media_path" ]] || exit 1
  done
elif [[ -n "$reuse_media_id" ]]; then
  reuse_source="$base/audit-$reuse_media_id"
  [[ -d "$reuse_source" && ! -L "$reuse_source" && "$(realpath "$reuse_source")" == "$reuse_source" ]] || exit 1
  [[ -f "$reuse_source/commit.txt" && ! -L "$reuse_source/commit.txt" ]] || exit 1
  [[ "$(cat "$reuse_source/commit.txt")" == "$current_commit" ]] || { echo 'Media source baseline mismatch'; exit 1; }
  for spec in 'storage:STORAGE_DIR:/app/storage' 'legacy:LEGACY_LOCAL_DIR:'; do
    IFS=: read -r label env_name fallback <<< "$spec"
    media_path=$(docker exec "$reader" node -e 'process.stdout.write(process.env[process.argv[1]]||process.argv[2]||"")' "$env_name" "$fallback")
    [[ -n "$media_path" ]] || continue
    [[ "$media_path" == /app/storage || "$media_path" == /app/legacy ]] || exit 1
    [[ -f "$reuse_source/$label.path" && ! -L "$reuse_source/$label.path" && -f "$reuse_source/$label.tar.gz" && ! -L "$reuse_source/$label.tar.gz" ]] || exit 1
    [[ "$(cat "$reuse_source/$label.path")" == "$media_path" ]] || { echo 'Media source path mismatch'; exit 1; }
    printf '%s\n' "$media_path" > "$backup/$label.path"
    # A separate copy/reflink prevents later writes to the source changing this run.
    cp --reflink=auto -- "$reuse_source/$label.tar.gz" "$backup/$label.tar.gz"
    gzip -t "$backup/$label.tar.gz" 2> "$backup/$label-archive-validation.log"
    mkdir -m 700 "$backup/$label-extracted"
    [[ ! -L "$backup" && "$(realpath "$backup")" == "$backup" && ! -L "$backup/$label-extracted" && "$(realpath "$backup/$label-extracted")" == "$backup/$label-extracted" ]] || exit 1
    tar -xzf "$backup/$label.tar.gz" -C "$backup/$label-extracted" --no-same-owner --keep-old-files > "$backup/$label-extract.log" 2>&1
    node "$tools_dir/media-proof.cjs" snapshot "$backup/$label-extracted" > "$backup/$label-before.json"
  done
  printf '%s\n' "$reuse_media_id" > "$backup/REUSED_MEDIA_SOURCE"
else
  # Compress media while the app is live; exact bidirectional verification under
  # the guarded pause below rejects any concurrent upload/change before release.
  for spec in 'storage:STORAGE_DIR:/app/storage' 'legacy:LEGACY_LOCAL_DIR:'; do
    IFS=: read -r label env_name fallback <<< "$spec"
    media_path=$(docker exec "$reader" node -e 'process.stdout.write(process.env[process.argv[1]]||process.argv[2]||"")' "$env_name" "$fallback")
    [[ -n "$media_path" ]] || continue
    [[ "$media_path" == /app/storage || "$media_path" == /app/legacy ]] || exit 1
    printf '%s\n' "$media_path" > "$backup/$label.path"
    docker exec -u 0 "$reader" tar -czf - -C "$media_path" . > "$backup/$label.tar.gz"
    gzip -t "$backup/$label.tar.gz"
    mkdir -m 700 "$backup/$label-extracted"
    tar -xzf "$backup/$label.tar.gz" -C "$backup/$label-extracted" --no-same-owner
    node "$tools_dir/media-proof.cjs" snapshot "$backup/$label-extracted" > "$backup/$label-before.json"
  done
fi
# Independent time-bound resume survives SSH disconnects or a killed shell.
systemd-run --unit="$watchdog" --on-active=15m /bin/sh -c 'touch "$1"; exec /usr/bin/docker unpause "$2"' sh "$backup/WATCHDOG_FIRED" "$container" >/dev/null
paused=1
docker pause "$container" >/dev/null
echo 'Maintenance backup started; automatic resume guard armed.'
echo 'Taking a private snapshot from the live app database connection.'
docker exec -i "$reader" node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/before.json"
docker exec -i "$reader" node - snapshot-full < "$tools_dir/database-proof.cjs" > "$backup/full-before.json"
if [[ "$release_profile" == merchant_oauth || "$release_profile" == merchant_headers || "$release_profile" == supplier_selection || "$release_profile" == public_home || "$release_profile" == national_day || "$release_profile" == national_day_immersive || "$release_profile" == national_day_loyalty ]]; then
  docker exec -i "$reader" node - snapshot < "$tools_dir/supplier-preservation-proof.cjs" > "$backup/supplier-before.json"
fi
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
  [[ -f "$backup/$label-before.json" && "$(cat "$backup/$label.path")" == "$media_path" ]] || exit 1
  docker exec -i -u 0 "$reader" node - snapshot "$media_path" < "$tools_dir/media-proof.cjs" > "$backup/$label-current.json"
  node "$tools_dir/media-proof.cjs" verify "$backup/$label-before.json" "$backup/$label-current.json"
  # Reverse verification rejects added live files as well as missing/changed ones.
  node "$tools_dir/media-proof.cjs" verify "$backup/$label-current.json" "$backup/$label-before.json"
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
if [[ "$release_profile" == national_day_loyalty ]]; then
  (cd "$backup" && sha256sum LOYALTY_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
elif [[ "$release_profile" == merchant_headers ]]; then
  # Child DB/code/image are independent; media restore reads parent archives
  # named and pinned by this private reference. Never remove its parent backup.
  (cd "$backup" && sha256sum PARENT_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
elif [[ "$release_profile" == national_day_immersive ]]; then
  (cd "$backup" && sha256sum IMMERSIVE_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
elif [[ "$release_profile" == national_day ]]; then
  (cd "$backup" && sha256sum NATIONAL_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
elif [[ "$release_profile" == public_home ]]; then
  (cd "$backup" && sha256sum HOME_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
elif [[ "$release_profile" == supplier_selection && -n "$reuse_media_id" ]]; then
  # Restore media only from the pinned full parent; retain both earlier backups.
  (cd "$backup" && sha256sum SELECTION_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path >> SHA256SUMS)
fi
printf '%s\n' "$current_commit" > "$backup/VERIFIED"
printf 'BACKUP_ID=%s\nROLLBACK_COMMIT=%s\nPrivate backup restored and verified successfully.\n' "$backup_id" "$current_commit"
