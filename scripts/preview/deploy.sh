#!/usr/bin/env bash
set -euo pipefail
umask 077
preview_root=/root/trbhh-categories-preview
revision=${1:?commit required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision'; exit 1; }
[[ ! -L "$preview_root" && "$(realpath "$preview_root")" == "$preview_root" ]] || exit 1
cd "$preview_root"
[[ -f .preview-only && "$(cat .preview-only)" == 'trbhh-categories-preview' ]] || exit 1
[[ -f "releases/$revision/preview.sql" ]] || exit 1

# Only this dedicated project's state is read or changed. Existing site directories,
# containers, environment files, databases, networks and ports are never used.
if [[ ! -f .env ]]; then
  [[ ! -e bootstrap.sql ]] || { echo 'Unexpected existing bootstrap'; exit 1; }
  cp "releases/$revision/preview.sql" bootstrap.sql
  chmod 0644 bootstrap.sql
  printf 'PREVIEW_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
  printf 'PREVIEW_DB_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env
  printf 'PREVIEW_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
else
  mkdir -p backups
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  cp .env "backups/$stamp.env"
  cp compose.yml "backups/$stamp.compose.yml"
  cp nginx.conf "backups/$stamp.nginx.conf"
  docker compose -p trbhh-categories-preview -f compose.yml exec -T preview-db \
    sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --no-tablespaces -upreview trbhh_preview_audit' \
    > "backups/$stamp.sql"
fi
sed -i '/^PREVIEW_REV=/d' .env
printf 'PREVIEW_REV=%s\n' "$revision" >> .env
cp "releases/$revision/compose.yml" compose.yml
cp "releases/$revision/nginx.conf" nginx.conf
docker compose -p trbhh-categories-preview -f compose.yml config --quiet
docker compose -p trbhh-categories-preview -f compose.yml up -d --build --wait --wait-timeout 360

for attempt in $(seq 1 36); do
  preview_url=$(docker compose -p trbhh-categories-preview -f compose.yml logs --no-color preview-tunnel 2>&1 \
    | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [[ -n "$preview_url" ]] && curl -fsS --max-time 20 "$preview_url/login" -o /dev/null; then
    printf '%s\n' "$preview_url" > preview-url.txt
    printf 'PREVIEW_URL=%s\nPREVIEW_REV=%s\n' "$preview_url" "$revision"
    exit 0
  fi
  sleep 5
done
echo 'Preview services started, but the external URL is not ready.'
exit 1
