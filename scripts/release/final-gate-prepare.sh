#!/usr/bin/env bash
# Back up production and prepare an isolated writable test of the EXACT preview image.
# Never executes application code with production database write credentials.
set -euo pipefail
umask 077
run=$1
tools_dir=$2
[[ "$run" =~ ^[0-9]+$ && "$tools_dir" == "/root/trbhh-release-tools/final-$run" ]]
candidate=3e88277b4851483cd9d42b9355a36b875894bfe6
[[ "$(git -C /root/trbhh-staging rev-parse HEAD)" == "$candidate" ]]
base=/root/trbhh-release-backups
backup="$base/final-$run"
[[ ! -L "$base" && ! -e "$backup" ]]
mkdir -p "$base"
mkdir "$backup"
chmod 700 "$backup"
docker inspect trbhh-app > "$backup/production-container.json"
docker inspect trbhh-staging-app > "$backup/preview-container.json"
git -C /root/trbhh rev-parse HEAD > "$backup/production-sha.txt"
printf '%s\n' "$candidate" > "$backup/preview-sha.txt"
git -C /root/trbhh diff --binary > "$backup/production-working-tree.patch"
docker inspect -f '{{.Image}}' trbhh-app > "$backup/production-image.txt"
image=$(docker inspect -f '{{.Image}}' trbhh-staging-app)
[[ "$image" == sha256:9be9b27c720819af5d8d6fea270b719ba7b8797bc875798df4cd99ebe8ac8108 ]]
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
# Test network has no outbound route; the cloned database is never publicly exposed.
network="trbhh-final-$run"
db="trbhh-final-db-$run"
redis="trbhh-final-redis-$run"
app="trbhh-final-app-$run"
docker network create --internal --label "trbhh.final-gate=$run" "$network" >/dev/null
export GATE_BACKUP="$backup" GATE_DB="$db" GATE_REDIS="$redis"
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
docker run -d --name "$db" --network "$network" --label "trbhh.final-gate=$run" --env-file "$backup/mysql.env" mysql:8.0 --event-scheduler=OFF >/dev/null
deadline=$((SECONDS+120))
until docker exec "$db" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -uroot --silent' >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo 'ISOLATED_DATABASE_NOT_READY'; exit 1; }
  sleep 2
done
[[ "$(docker inspect -f '{{index .Config.Labels "trbhh.final-gate"}}' "$db")" == "$run" ]]
docker exec -i "$db" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot' < "$backup/database.sql" 2> "$backup/restore-errors.private.log"
docker run -d --name "$redis" --network "$network" --label "trbhh.final-gate=$run" redis:7-alpine >/dev/null
mkdir "$backup/test-storage"
tar -xzf "$backup/storage.tar.gz" -C "$backup/test-storage"
chown -R 1001:1001 "$backup/test-storage"
docker run -d --name "$app" --network "$network" --label "trbhh.final-gate=$run" --env-file "$backup/test-app.env" -p 127.0.0.1:3097:3000 -v "$backup/test-storage:/app/storage" "$image" >/dev/null
deadline=$((SECONDS+90))
until curl --fail --silent -o /dev/null http://127.0.0.1:3097/; do
  (( SECONDS < deadline )) || { echo 'ISOLATED_APPLICATION_NOT_READY'; exit 1; }
  sleep 2
done
[[ "$(docker inspect -f '{{.Image}}' "$app")" == "$image" ]]
printf '%s\n' "$run" > "$backup/ISOLATED_READY"
printf 'ISOLATED_READY run=%s sha=%s image=%s\n' "$run" "$candidate" "$image"
