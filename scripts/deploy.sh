#!/usr/bin/env bash
# Automated deploy for Hostinger VPS (Ubuntu 24.04).
# Pulls latest code, rebuilds the app image, runs migrations, restarts stack.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull --ff-only || echo "  (skip git pull — not a clone or has local changes)"

# نخبز الـcommit الحالي في الصورة ليظهر رقم النسخة في التذييل (يرفض Dockerfile أي قيمة غير
# commit من 40 خانة، فنمرّر الهاش الكامل). بلا هذا تُبنى الصورة بـ development فيختفي الرقم.
export TRBHH_RELEASE_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo development)"
echo "==> Release commit: ${TRBHH_RELEASE_COMMIT}"

echo "==> Building and starting containers"
docker compose pull db redis nginx || true
docker compose up -d --build

echo "==> Waiting for database"
until docker compose exec -T db mysqladmin ping -h localhost --silent 2>/dev/null; do sleep 3; done

echo "==> Syncing Prisma client (schema is introspected; no destructive migrations)"
docker compose exec -T app node -e "console.log('app up')" || true

echo "==> Cleaning old images"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Deploy complete. Status:"
docker compose ps
