#!/usr/bin/env bash
# Back up production and prepare an isolated writable test of the EXACT preview image.
# Never executes application code with production database write credentials.
set -euo pipefail
umask 077
run=$1
tools_dir=$2
[[ "$run" =~ ^[0-9]+$ && "$tools_dir" == "/root/trbhh-release-tools/final-$run" ]]
candidate=362057872642630f3dd734b15af582e2e6343213
[[ "$(git -C /root/trbhh-staging rev-parse HEAD)" == "$candidate" ]]
base=/root/trbhh-release-backups
backup="$base/final-$run"
[[ ! -L "$base" && ! -L "$backup" ]]
if [[ ! -e "$backup" ]]; then
mkdir -p "$base"
mkdir "$backup"
chmod 700 "$backup"
docker inspect trbhh-app > "$backup/production-container.json"
docker inspect trbhh-staging-app > "$backup/preview-container.json"
production_sha=$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' trbhh-app)
[[ "$production_sha" =~ ^[0-9a-f]{40}$ ]]
printf '%s\n' "$production_sha" > "$backup/production-sha.txt"
printf '%s\n' "$candidate" > "$backup/preview-sha.txt"
git -C /root/trbhh diff --binary > "$backup/production-working-tree.patch"
docker inspect -f '{{.Image}}' trbhh-app > "$backup/production-image.txt"
image=$(docker inspect -f '{{.Image}}' trbhh-staging-app)
[[ "$image" == sha256:35547e0e27fccbe1ae80d1e12e1e07c5a5a0d7547f197d5b0685c4656eda44c5 ]]
printf '%s\n' "$image" > "$backup/preview-image.txt"
docker image tag "$(cat "$backup/production-image.txt")" "trbhh-rollback:final-$run"
docker image tag "$image" "trbhh-release:final-$run"
# Preserve compose and private runtime configuration without logging their contents.
tar -czf "$backup/runtime-config.tar.gz" -C /root/trbhh docker-compose.yml .env
storage=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Source}}{{end}}{{end}}' trbhh-app)
[[ "$storage" == /var/lib/docker/volumes/*/_data && -d "$storage" && ! -L "$storage" ]]
needed=$(du -sk "$storage" | cut -f1)
available=$(df -Pk "$backup" | awk 'NR==2 {print $4}')
(( available > needed * 3 + 10485760 ))
docker exec -i trbhh-app node - dump < "$tools_dir/database-proof.cjs" > "$backup/database.sql.partial"
test -s "$backup/database.sql.partial"
mv "$backup/database.sql.partial" "$backup/database.sql"
tar -czf "$backup/storage.tar.gz" -C "$storage" .
gzip -t "$backup/storage.tar.gz" "$backup/runtime-config.tar.gz"
(cd "$backup" && sha256sum database.sql storage.tar.gz runtime-config.tar.gz > SHA256SUMS && sha256sum --check --status SHA256SUMS)
printf 'BACKUP_FILES_VERIFIED\n'
else
  [[ "$(cat "$backup/preview-sha.txt")" == "$candidate" ]]
  image=$(cat "$backup/preview-image.txt")
  [[ "$image" == "$(docker inspect -f '{{.Image}}' trbhh-staging-app)" ]]
  [[ "$(cat "$backup/production-image.txt")" == "$(docker inspect -f '{{.Image}}' trbhh-app)" ]]
  (cd "$backup" && sha256sum --check --status SHA256SUMS)
fi
# Test network has no outbound route; the cloned database is never publicly exposed.
network="trbhh-final-$run"
db="trbhh-final-db-$run"
redis="trbhh-final-redis-$run"
app="trbhh-final-app-$run"
if ! docker network inspect "$network" >/dev/null 2>&1; then
  docker network create --internal --label "trbhh.final-gate=$run" "$network" >/dev/null
fi
[[ "$(docker network inspect -f '{{.Internal}}' "$network")" == true ]]
export GATE_BACKUP="$backup" GATE_DB="$db" GATE_REDIS="$redis"
if [[ ! -f "$backup/mysql.env" ]]; then
python3 - <<'PY'
import json,os,secrets,urllib.parse,pathlib
p=pathlib.Path(os.environ['GATE_BACKUP'])
c=json.loads((p/'production-container.json').read_text())[0]
env=dict(item.split('=',1) for item in c['Config']['Env'] if '=' in item)
name=urllib.parse.unquote(urllib.parse.urlparse(env['DATABASE_URL']).path[1:])
assert name and all(x.isalnum() or x=='_' for x in name)
password=secrets.token_hex(32)
(p/'mysql.env').write_text('MYSQL_ROOT_PASSWORD='+password+'\n')
app={'DATABASE_URL':'mysql://root:'+password+'@'+os.environ['GATE_DB']+':3306/'+name,
 'REDIS_URL':'redis://'+os.environ['GATE_REDIS']+':6379','AUTH_SECRET':secrets.token_hex(32),
 'HOSTNAME':'0.0.0.0','PORT':'3000','NODE_ENV':'production','COOKIE_SECURE':'false',
 'TRBHH_PREVIEW_MODE':'1','TRBHH_READ_ONLY_PREVIEW':'0','SUPPLIER_ALLOW_LIVE_ORDERS':'false',
 'STORAGE_DIR':'/app/storage','TZ':'Asia/Riyadh'}
(p/'test-app.env').write_text(''.join(k+'='+v+'\n' for k,v in app.items()))
PY
fi
if ! docker inspect "$db" >/dev/null 2>&1; then
  docker run -d --name "$db" --network "$network" --label "trbhh.final-gate=$run" --env-file "$backup/mysql.env" mysql:8.0 --event-scheduler=OFF >/dev/null
fi
[[ "$(docker inspect -f '{{index .Config.Labels "trbhh.final-gate"}}' "$db")" == "$run" ]]
deadline=$((SECONDS+120))
# The initialization server exposes a temporary socket before its restart; wait for final TCP.
until docker exec "$db" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=TCP -h127.0.0.1 -uroot -Nse "SELECT 1"' >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo 'ISOLATED_DATABASE_NOT_READY'; exit 1; }
  sleep 2
done
[[ "$(docker inspect -f '{{index .Config.Labels "trbhh.final-gate"}}' "$db")" == "$run" ]]
if [[ ! -f "$backup/RESTORE_VERIFIED" ]]; then
  docker exec -i "$db" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=TCP -h127.0.0.1 -uroot' < "$backup/database.sql" 2> "$backup/restore-errors.private.log"
  printf '%s\n' "$run" > "$backup/RESTORE_VERIFIED"
fi
if ! docker inspect "$redis" >/dev/null 2>&1; then
  docker run -d --name "$redis" --network "$network" --label "trbhh.final-gate=$run" redis:7-alpine >/dev/null
fi
if ! docker inspect "$app" >/dev/null 2>&1; then
  mkdir "$backup/test-storage"
  tar -xzf "$backup/storage.tar.gz" -C "$backup/test-storage"
  chown -R 1001:1001 "$backup/test-storage"
  docker run -d --name "$app" --network "$network" --label "trbhh.final-gate=$run" --env-file "$backup/test-app.env" -v "$backup/test-storage:/app/storage" "$image" >/dev/null
fi
[[ "$(docker inspect -f '{{index .Config.Labels "trbhh.final-gate"}}' "$app")" == "$run" ]]
deadline=$((SECONDS+90))
until docker exec "$app" node -e 'fetch("http://127.0.0.1:3000/",{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))'; do
  (( SECONDS < deadline )) || { echo 'ISOLATED_APPLICATION_NOT_READY'; exit 1; }
  sleep 2
done
[[ "$(docker inspect -f '{{.Image}}' "$app")" == "$image" ]]
printf '%s\n' "$run" > "$backup/ISOLATED_READY"
printf 'ISOLATED_READY run=%s sha=%s image=%s\n' "$run" "$candidate" "$image"
