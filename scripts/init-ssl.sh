#!/usr/bin/env bash
# Obtain Let's Encrypt certificates for the domain via certbot (webroot).
# Run AFTER the stack is up and DNS points at this VPS.
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:-trbhh.com}"
EMAIL="${2:-admin@trbhh.com}"

mkdir -p docker/certbot/www docker/certbot/conf
echo "==> Requesting certificate for $DOMAIN"
docker run --rm \
  -v "$(pwd)/docker/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/docker/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email

echo "==> Certificate issued. Now:"
echo "   1) Uncomment the 443 server block in docker/nginx.conf"
echo "   2) Switch 'location /' in the port-80 block to: return 301 https://\$host\$request_uri;"
echo "   3) docker compose restart nginx"
echo "   Renewal: add to crontab ->  0 3 * * * cd $(pwd) && docker compose run --rm certbot renew && docker compose restart nginx"
