#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh && $(id -u) == 0 ]]
if [[ ${1:-} != --run ]]; then
  revision=${1:-}
  candidate=${2:-}
  [[ $revision =~ ^[a-f0-9]{40}$ && $candidate =~ ^[a-f0-9]{40}$ ]]
  run_id=$(date +%s)
  target=/root/trbhh-release-tools/cj-webhook-complete-$run_id
  [[ ! -e $target ]]
  mkdir -m 700 "$target" "$target/diagnostics"
  for file in manual-cj-webhook-completion.sh manual-arabic-app-deploy.sh code-only-compose.cjs verify-runtime.cjs; do
    git show "$revision:scripts/release/$file" > "$target/$file"
  done
  for file in cj-catalog-audit.cjs cj-sandbox-probe.cjs cj-sandbox-financial.cjs cj-webhook-setup.cjs cj-sandbox-inbound.cjs; do
    git show "$candidate:scripts/diagnostics/$file" > "$target/diagnostics/$file"
    node --check "$target/diagnostics/$file"
    chmod 644 "$target/diagnostics/$file"
  done
  bash -n "$target/manual-cj-webhook-completion.sh"
  touch "$target/result.log"
  systemd-run --unit="trbhh-cj-webhook-complete-$run_id" --property=Type=exec /bin/bash "$target/manual-cj-webhook-completion.sh" --run "$revision" "$candidate" "$target"
  printf 'RESULT: tail -n 40 %s/result.log\n' "$target"
  exit 0
fi
revision=${2:?}
candidate=${3:?}
target=${4:?}
[[ $revision =~ ^[a-f0-9]{40}$ && $candidate =~ ^[a-f0-9]{40}$ ]]
[[ $target =~ ^/root/trbhh-release-tools/cj-webhook-complete-[0-9]+$ && -d $target && ! -L $target ]]
exec > "$target/result.log" 2>&1
exec 8>/run/lock/trbhh-cj-webhook-completion.lock
flock -n 8
copy_diagnostics(){
  docker exec trbhh-app mkdir -p "/tmp/$(basename "$target")"
  docker cp "$target/diagnostics/." "trbhh-app:/tmp/$(basename "$target")/"
}
copy_diagnostics
echo 'PREPARING_ENCRYPTED_WEBHOOK_IDENTITY — no payment or store changes'
docker exec -e NODE_PATH=/app/node_modules trbhh-app timeout 120 node "/tmp/$(basename "$target")/cj-webhook-setup.cjs" --prepare

output=$(bash "$target/manual-arabic-app-deploy.sh" "$revision" "$candidate")
printf '%s\n' "$output"
deploy_id=$(printf '%s\n' "$output" | sed -n 's/^RUN_ID=//p')
[[ $deploy_id =~ ^[0-9]+$ ]]
for attempt in $(seq 1 360); do
  if ! systemctl is-active --quiet "trbhh-code-deploy-$deploy_id.service"; then break; fi
  sleep 5
done
deploy_log=/root/trbhh-release-tools/arabic-app-$deploy_id/result.log
if ! grep -Fq "COMMIT=$candidate FLAGS_UNCHANGED=1" "$deploy_log"; then
  echo "DEPLOYMENT_NOT_VERIFIED — inspect $deploy_log; no callback activation or simulation attempted"
  exit 1
fi
echo 'APPLICATION_CODE_ONLY_VERIFIED — activating signed callbacks next'
copy_diagnostics
docker exec -e NODE_PATH=/app/node_modules trbhh-app timeout 120 node "/tmp/$(basename "$target")/cj-webhook-setup.cjs" --activate
docker exec -e NODE_PATH=/app/node_modules trbhh-app timeout 240 node "/tmp/$(basename "$target")/cj-sandbox-inbound.cjs" | tee "$target/sandbox-result.log"
node - "$target/sandbox-result.log" <<'NODE'
const fs=require('node:fs');
const events=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const result=events.findLast(x=>x.event==='TRBHH_INBOUND_RESULT');
if(result?.cjSimulationVerified&&result.paidStatusReceived&&result.trackingReceived){console.log('SANDBOX_PAYMENT_TRACKING_AND_INBOUND_VERIFIED — refund remains unverified; no real payment attempted');}
else {console.log('CJ_COMPLETION_PENDING — inspect diagnostics; do not repeat mutation automatically');process.exitCode=2;}
NODE
