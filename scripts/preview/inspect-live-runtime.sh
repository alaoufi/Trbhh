#!/usr/bin/env bash
# Read-only infrastructure inventory; never print environment values or row data.
set -euo pipefail
cd /root/trbhh
printf 'PRODUCTION_REV='; git rev-parse HEAD
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
printf 'AVAILABLE_MEMORY_MB='; awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo
printf 'AVAILABLE_DISK_KB='; df -Pk /root | awk 'NR==2 {print $4}'
printf 'HOST_MYSQL_CLIENT='; command -v mysql >/dev/null && echo yes || echo no
if mysql --protocol=socket --batch --skip-column-names -e 'SHOW GRANTS FOR CURRENT_USER' 2>/dev/null | grep -q 'ALL PRIVILEGES ON \*\.\*.*WITH GRANT OPTION'; then
  echo 'HOST_SOCKET_PROVISIONING=yes'
else
  echo 'HOST_SOCKET_PROVISIONING=no'
fi
if test -r /etc/mysql/debian.cnf && mysql --defaults-file=/etc/mysql/debian.cnf --protocol=socket --batch --skip-column-names -e 'SHOW GRANTS FOR CURRENT_USER' 2>/dev/null | grep -q 'ALL PRIVILEGES ON \*\.\*.*WITH GRANT OPTION'; then
  echo 'HOST_DEFAULTS_PROVISIONING=yes'
else
  echo 'HOST_DEFAULTS_PROVISIONING=no'
fi
app_uuid=$(docker compose exec -T app node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRawUnsafe("SELECT @@server_uuid AS id").then(r=>console.log(r[0].id)).finally(()=>p.$disconnect())')
db_uuid=$(docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --skip-column-names -e "SELECT @@server_uuid"' 2>/dev/null || true)
if test -n "$db_uuid" && test "$app_uuid" = "$db_uuid"; then
  echo 'BUNDLED_DB_MATCHES_PRODUCTION=yes'
else
  echo 'BUNDLED_DB_MATCHES_PRODUCTION=no'
fi
docker compose exec -T app node <<'NODE'
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{
 const u=new URL(process.env.DATABASE_URL);
 console.log(JSON.stringify({dbHost:u.hostname,dbPort:u.port||'3306',dbSchema:u.pathname.slice(1),storageConfigured:Boolean(process.env.STORAGE_DIR),legacyMediaConfigured:Boolean(process.env.LEGACY_MEDIA_BASE)}));
 const grants=await db.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
 const values=grants.flatMap(Object.values).join('\n');
 console.log(JSON.stringify({canCreateUser:/CREATE USER|ALL PRIVILEGES ON \*\.\*/i.test(values),hasGrantOption:/WITH GRANT OPTION/i.test(values)}));
})().catch(()=>{console.error('Read-only runtime inventory failed');process.exitCode=1}).finally(()=>db.$disconnect());
NODE
