#!/usr/bin/env bash
# Explicit manual installation only. Never provisions models or changes the app.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Root SSH session required.' >&2; exit 1; }
[[ $# -eq 1 ]] || { echo 'Usage: install-search-refresh.sh /root/trbhh-release-tools/semantic-search-deploy-N/ai' >&2; exit 1; }
assets=$1
[[ $assets =~ ^/root/trbhh-release-tools/semantic-search-deploy-[0-9]+/ai$ ]] || { echo 'Invalid immutable staged asset directory.' >&2; exit 1; }
# Refuse symlinked or non-root/group/world-writable staged path components.
check_owned() {
  local target=$1 mode
  [[ -e $target && ! -L $target && $(stat -c %u "$target") == 0 ]] || return 1
  mode=$(stat -c %a "$target")
  (( (8#$mode & 0022) == 0 ))
}
for target in /root /root/trbhh-release-tools "${assets%/ai}" "$assets"; do
  [[ -d $target ]] && check_owned "$target" || { echo 'Unsafe staged directory.' >&2; exit 1; }
done
for file in semantic-core.cjs public-product-select.cjs build-product-index.cjs; do
  [[ -f $assets/$file ]] && check_owned "$assets/$file" || { echo 'Unsafe staged index asset.' >&2; exit 1; }
done
for command in docker flock sha256sum systemctl timeout; do command -v "$command" >/dev/null; done
# Confirm the container also has the bounded-execution primitive before enabling.
docker exec trbhh-app timeout 5 nice -n 15 node -e 'process.exit(0)'
runner=/usr/local/libexec/trbhh-semantic-index-refresh
[[ ! -L /usr/local/libexec && ! -L $runner ]] || exit 1
install -d -m 755 /usr/local/libexec
# Pin every source hash: later mutation of a staged file fails closed.
{
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
  printf 'assets=%q\n' "$assets"
  printf 'exec 9>/run/lock/trbhh-semantic-index.lock\nflock -n 9 || exit 0\n'
  printf 'cd "$assets"\n'
  printf 'for file in semantic-core.cjs public-product-select.cjs build-product-index.cjs; do [[ -f $file && ! -L $file ]] || exit 1; done\n'
  printf 'sha256sum --check --status <<\x27TRBHH_HASHES\x27\n'
  (cd "$assets" && sha256sum semantic-core.cjs public-product-select.cjs build-product-index.cjs)
  printf 'TRBHH_HASHES\n'
  cat <<'RUNNER'
{
  printf 'globalThis.__trbhhSemanticCore=(()=>{const module={exports:{}};\n'
  cat semantic-core.cjs
  printf '\nreturn module.exports;})();\n'
  printf 'globalThis.__trbhhPublicProductSelect=(()=>{const module={exports:{}};\n'
  cat public-product-select.cjs
  printf '\nreturn module.exports;})();\n'
  cat build-product-index.cjs
} | docker exec -i trbhh-app timeout --signal=TERM --kill-after=10s 29m nice -n 15 node - --refresh
RUNNER
} > "$runner"
chmod 755 "$runner"
for unit in /etc/systemd/system/trbhh-semantic-index-refresh.service /etc/systemd/system/trbhh-semantic-index-refresh.timer; do [[ ! -L $unit ]] || exit 1; done
cat > /etc/systemd/system/trbhh-semantic-index-refresh.service <<'SERVICE'
[Unit]
Description=Refresh approved local Trbhh product search index
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/trbhh-semantic-index-refresh
TimeoutStartSec=30min
Nice=15
UMask=0077
SERVICE
cat > /etc/systemd/system/trbhh-semantic-index-refresh.timer <<'TIMER'
[Unit]
Description=Refresh approved local product index every 15 minutes

[Timer]
OnBootSec=15min
OnUnitInactiveSec=15min
AccuracySec=1min
Unit=trbhh-semantic-index-refresh.service

[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now trbhh-semantic-index-refresh.timer
echo SEMANTIC_INDEX_REFRESH_TIMER_INSTALLED
