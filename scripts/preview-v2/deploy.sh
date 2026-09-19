#!/usr/bin/env bash
set -euo pipefail
umask 077
preview_root=/root/trbhh-preview-v2
revision=${1:?commit required}
[[ "$revision" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 1
[[ ! -L "$preview_root" && "$(realpath "$preview_root")" == "$preview_root" ]] || exit 1
cd "$preview_root"
[[ -f .preview-only && "$(cat .preview-only)" == trbhh-preview-v2 ]] || exit 1
[[ ! -L releases && ! -L "releases/$revision" && "$(realpath "releases/$revision")" == "$preview_root/releases/$revision" ]] || exit 1
[[ -f "releases/$revision/preview.sql" ]] || exit 1
[[ ! -L .env && ! -L backups && ! -L .candidate.env && ! -L .candidate.compose.yml && ! -L compose.yml && ! -L nginx.conf && ! -L public-media ]] || exit 1
# Retain every immutable snapshot asset across app updates: the database persists.
mkdir -p public-media
chmod 0755 public-media
[[ -d "releases/$revision/app/public/snapshot-media" && ! -L "releases/$revision/app/public/snapshot-media" ]] || exit 1
while IFS= read -r -d '' source; do
  name=$(basename "$source")
  [[ "$name" =~ ^[0-9a-f]{64}\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$ && ! -L "$source" && ! -L "public-media/$name" ]] || exit 1
  if [[ -e "public-media/$name" ]]; then
    cmp -s "$source" "public-media/$name" || { echo 'Conflicting snapshot asset; refusing replacement'; exit 1; }
  else
    install -m 0644 "$source" "public-media/$name"
  fi
done < <(find "releases/$revision/app/public/snapshot-media" -mindepth 1 -maxdepth 1 -print0)
previous=false
if [[ -f .env ]]; then
  previous=true
  mkdir -p backups
  stamp="$revision"
  cp .env "backups/$stamp.env"
  cp compose.yml "backups/$stamp.compose.yml"
  cp nginx.conf "backups/$stamp.nginx.conf"
  docker compose -p trbhh-preview-v2 -f compose.yml exec -T preview-db \
    sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --no-tablespaces -upreview trbhh_preview_v2' > "backups/$stamp.sql"
  cp .env .candidate.env
else
  [[ ! -e bootstrap.sql ]] || { echo 'Unexpected bootstrap; refusing overwrite'; exit 1; }
  {
    printf 'PREVIEW_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'PREVIEW_DB_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'PREVIEW_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
  } > .candidate.env
fi
sed -i '/^PREVIEW_REV=/d' .candidate.env
printf 'PREVIEW_REV=%s\n' "$revision" >> .candidate.env
cp "releases/$revision/compose.yml" .candidate.compose.yml
docker compose --env-file .candidate.env -p trbhh-preview-v2 -f .candidate.compose.yml config --quiet
docker compose --env-file .candidate.env -p trbhh-preview-v2 -f .candidate.compose.yml build preview-app

recover_failure() {
  trap - ERR TERM INT HUP
  docker compose -p trbhh-preview-v2 -f compose.yml stop preview-app preview-proxy preview-tunnel >/dev/null 2>&1 || true
  if "$previous"; then
    cp "backups/$stamp.env" .env
    cp "backups/$stamp.compose.yml" compose.yml
    cp "backups/$stamp.nginx.conf" nginx.conf
    echo 'Sandbox failed; previous configuration restored, app stopped. Database backup retained; review migrations before restarting previous release.'
  else
    echo 'Initial sandbox activation failed; app stopped. Complete credentials and data retained for diagnosis.'
  fi
  exit 1
}
trap recover_failure ERR TERM INT HUP
if ! "$previous"; then
  cp "releases/$revision/preview.sql" bootstrap.sql
  chmod 0644 bootstrap.sql
fi
mv .candidate.env .env
mv .candidate.compose.yml compose.yml
cp "releases/$revision/nginx.conf" nginx.conf
docker compose -p trbhh-preview-v2 -f compose.yml up -d --build --wait --wait-timeout 360
# Nginx resolves the application address at startup; never keep a stale upstream.
docker compose -p trbhh-preview-v2 -f compose.yml up -d --no-deps --force-recreate preview-proxy
for attempt in $(seq 1 36); do
  preview_url=$(docker compose -p trbhh-preview-v2 -f compose.yml logs --no-color preview-tunnel 2>&1 | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [[ -n "$preview_url" ]] && curl -fsS --max-time 20 "$preview_url/login" -o /dev/null; then
    printf '%s\n' "$preview_url" > preview-url.txt
    printf 'PREVIEW_URL=%s\nPREVIEW_REV=%s\n' "$preview_url" "$revision"
    trap - ERR TERM INT HUP
    exit 0
  fi
  sleep 5
done
echo 'Sandbox external URL is not ready'; recover_failure
