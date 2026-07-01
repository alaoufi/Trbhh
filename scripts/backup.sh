#!/usr/bin/env bash
# Daily database backup. Add to crontab:  0 2 * * * /path/to/scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups"; mkdir -p "$OUT"
docker compose exec -T db mysqldump -uroot -p"${DB_ROOT_PASSWORD:-changeme_root}" \
  --single-transaction --routines "${DB_NAME:-trbhhdb}" | gzip > "$OUT/trbhh-$STAMP.sql.gz"
# keep last 14 backups
ls -1t "$OUT"/trbhh-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "Backup written: $OUT/trbhh-$STAMP.sql.gz"
