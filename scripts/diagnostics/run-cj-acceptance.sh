#!/usr/bin/env bash
# Read-only production evidence plus credential-free isolated application tests.
set -Eeuo pipefail
umask 077
revision=${1:?diagnostic revision required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
cd /root/trbhh
live=$(docker exec trbhh-app cat /app/RELEASE_COMMIT | tr -d '\r\n')
[[ "$live" =~ ^[a-f0-9]{40}$ ]] || { echo 'STOP: runtime revision unavailable'; exit 1; }
git cat-file -e "$live^{commit}"
dir=$(mktemp -d /root/trbhh-release-tools/cj-acceptance-XXXXXX)
mkdir "$dir/source"
git archive "$live" | tar -x -C "$dir/source"
printf '%s\n' "$live" > "$dir/application-commit"
cat > "$dir/refund-policy.txt" <<'POLICY'
Checked 2026-10-17 against official CJ documentation.
https://developers.cjdropshipping.com/en/api/api2/api/dispute.html
API-created orders support dispute creation; eligibility and maximum amounts are returned by dispute APIs.
expectType=1 requests refund; refundType=1 balance, refundType=2 platform.
https://blog.cjdropshipping.com/detail/1397471340032438273
Refund destination depends on chosen/eligible payment method: CJ Wallet or original payment method.
https://www.cjdropshipping.com/dispute-policy.html
Approval and evidence requirements apply. An application or status alone is not proof of money received.
No dispute/refund was requested. No documented Sandbox refund API was executed.
Account-specific refund eligibility, actual receipt and customer-bank refund remain UNVERIFIED.
POLICY
git show "$revision:scripts/diagnostics/run-cj-sandbox-evidence.sh" > "$dir/evidence.sh"
cat > "$dir/job.sh" <<'JOB'
#!/usr/bin/env bash
set -uo pipefail
dir=$1
revision=$2
finish(){ printf '%s\n' "$?" > "$dir/finished"; }
trap finish EXIT
cd /root/trbhh
# This script only reads provider order/settings and rejects null receiver probes.
bash "$dir/evidence.sh" "$revision" > "$dir/provider-evidence.log" 2>&1
provider=$?
printf '%s\n' "$provider" > "$dir/provider-exit"
# Build dependencies in a separate image with no production environment or mounts.
image="trbhh-cj-review:$(basename "$dir" | tr '[:upper:]' '[:lower:]')"
docker build --target deps -t "$image-deps" "$dir/source" > "$dir/build.log" 2>&1 || exit 1
printf 'FROM %s-deps\nWORKDIR /app\nCOPY . .\n' "$image" > "$dir/source/Dockerfile.acceptance"
docker build -f "$dir/source/Dockerfile.acceptance" -t "$image" "$dir/source" >> "$dir/build.log" 2>&1 || exit 1
# Tests use real application functions with simulated DB/provider boundaries.
# No network, secrets, production database, wallet or app-container mounts.
docker run --rm --network none --memory 1536m --cpus 1 -e AUTH_DB_TESTS=0 "$image" pnpm exec vitest run tests/unit/cj --maxWorkers=1 > "$dir/application-tests.log" 2>&1
tests=$?
printf '%s\n' "$tests" > "$dir/tests-exit"
printf 'APPLICATION_COMMIT=%s\nPROVIDER_EVIDENCE_EXIT=%s\nISOLATED_APPLICATION_TESTS_EXIT=%s\nREAL_PAYMENT_ATTEMPTED=false\nREFUND_EXECUTED=false\nLIVE_PURCHASE_APPROVED=false\n' "$(cat "$dir/application-commit")" "$provider" "$tests" > "$dir/summary.txt"
[[ "$provider" == 0 && "$tests" == 0 ]]
JOB
systemd-run --quiet --unit="trbhh-cj-acceptance-$(date +%s)" /bin/bash "$dir/job.sh" "$dir" "$revision"
printf 'One comprehensive run started. Report directory: %s\n' "$dir"
for ((i=0;i<60;i++)); do
 if [[ -f "$dir/finished" ]]; then
  [[ ! -f "$dir/summary.txt" ]] || cat "$dir/summary.txt"
  [[ ! -f "$dir/provider-evidence.log" ]] || tail -n 5 "$dir/provider-evidence.log"
  [[ ! -f "$dir/application-tests.log" ]] || tail -n 9 "$dir/application-tests.log"
  printf '\nALL REPORTS: %s\n' "$dir"
  if [[ "$(cat "$dir/finished")" != 0 ]]; then
   echo 'INCOMPLETE: inspect saved build.log/application-tests.log; do not authorize purchasing.'
  fi
  exit "$(cat "$dir/finished")"
 fi
 sleep 30
 printf 'Still collecting/building isolated tests (%s minutes); no payment.\n' "$(( (i+1)/2 ))"
done
echo "Background job continues; saved reports: $dir"
