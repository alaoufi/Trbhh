#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
revision=${1:?pinned revision required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
cd /root/trbhh
base=/root/trbhh-release-tools
mkdir -p "$base"
dir=$(mktemp -d "$base/cj-full-evidence-XXXXXX")
for file in cj-catalog-audit.cjs cj-sandbox-probe.cjs cj-webhook-setup.cjs cj-sandbox-identity.cjs cj-sandbox-evidence-source.cjs cj-sandbox-evidence-inbound.cjs cj-sandbox-evidence.cjs; do
 git show "$revision:scripts/diagnostics/$file" > "$dir/$file"
 node --check "$dir/$file"
 chmod 644 "$dir/$file"
done
node - "$dir" <<'JS'
const dir=process.argv[2];
require(dir+'/cj-sandbox-identity.cjs').stageExpectedIdentity('/root/trbhh-release-tools',dir+'/expected-identity.json');
JS
target="/tmp/$(basename "$dir")"
docker exec trbhh-app mkdir "$target"
docker cp "$dir/." "trbhh-app:$target/"
cat > "$dir/collect.sh" <<'RUN'
#!/usr/bin/env bash
set -uo pipefail
dir=$1
target=$2
docker exec -e NODE_PATH=/app/node_modules trbhh-app timeout 300 node "$target/cj-sandbox-evidence.cjs" > "$dir/result.log" 2>&1
status=$?
docker cp "trbhh-app:$target/report.json" "$dir/report.json" >> "$dir/result.log" 2>&1 || status=1
printf '%s\n' "$status" > "$dir/exit-code"
RUN
unit="trbhh-cj-evidence-$(date +%s)"
systemd-run --quiet --unit="$unit" /bin/bash "$dir/collect.sh" "$dir" "$target"
printf 'Read-only report running. Files: %s\n' "$dir"
for ((i=0;i<66;i++)); do
 if [[ -f "$dir/exit-code" ]]; then
  cat "$dir/result.log"
  printf '\nFULL REPORT: %s/report.json\n' "$dir"
  exit "$(cat "$dir/exit-code")"
 fi
 sleep 5
done
printf 'Still running; report preserved at %s/result.log\n' "$dir"
