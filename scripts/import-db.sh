#!/usr/bin/env bash
# Import the legacy MySQL dump into the running db container.
# Usage: bash scripts/import-db.sh [path-to-dump.sql|.sql.gz]
set -euo pipefail
DUMP="${1:-database/trbhh.sql.gz}"
source .env 2>/dev/null || true
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-changeme_root}"

echo "Importing $DUMP into the db container..."
if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP" | docker compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD"
else
  docker compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" < "$DUMP"
fi
echo "Done. Verifying:"
docker compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" -e \
  "USE ${DB_NAME:-trbhhdb}; SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM ads) AS ads;"
