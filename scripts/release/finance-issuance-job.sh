#!/usr/bin/env bash
# Operator-only host job; run from the authoritative Compose project directory.
# The separate issuance credential stays inside the running app container.
set +x +v
set -euo pipefail
umask 077

unavailable() { printf '%s\n' 'finance_issuance status=unavailable'; exit 1; }
[[ $# -eq 0 ]] || unavailable
for executable in docker flock timeout; do
  command -v "$executable" >/dev/null 2>&1 || unavailable
done
{ exec 9>/run/lock/trbhh-finance-issuance.lock; } 2>/dev/null || unavailable
if flock -n 9; then
  :
else
  lock_status=$?
  [[ "$lock_status" -eq 1 ]] || unavailable
  printf '%s\n' 'finance_issuance status=skipped_overlap'
  exit 0
fi

docker_status=0
result=$(timeout 75s docker compose exec -T app node - 2>/dev/null <<'FINANCE_ISSUANCE_NODE'
(async () => {
  const report = (status, counts) => {
    process.stdout.write('finance_issuance status=' + status + (counts ? ' issued=' + counts.issued + ' pending=' + counts.pending + ' failed=' + counts.failed : '') + '\n');
    process.exitCode = status === 'ok' ? 0 : 1;
  };
  const secret = process.env.FINANCE_ISSUANCE_SECRET || '';
  if (secret.length < 32) { report('not_configured'); return; }
  try {
    const response = await fetch('http://127.0.0.1:3000/api/finance/issue', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + secret},
      redirect: 'error',
      signal: AbortSignal.timeout(55000),
    });
    if (response.status !== 200) { report('http_' + response.status); return; }
    const payload = await response.json();
    if (!payload || ![payload.issued, payload.pending, payload.failed].every(value => Number.isSafeInteger(value) && value >= 0)) { report('invalid_response'); return; }
    report('ok', {issued: payload.issued, pending: payload.pending, failed: payload.failed});
  } catch {
    report('unavailable');
  }
})();
FINANCE_ISSUANCE_NODE
) || docker_status=$?

# Only status and integer counts reach the host journal, never raw diagnostics.
if [[ "$docker_status" -eq 0 && "$result" =~ ^finance_issuance\ status=ok\ issued=[0-9]+\ pending=[0-9]+\ failed=[0-9]+$ ]]; then
  printf '%s\n' "$result"
  exit 0
fi
if [[ "$result" =~ ^finance_issuance\ status=http_[1-5][0-9]{2}$ ]] ||
   [[ "$result" == 'finance_issuance status=not_configured' || "$result" == 'finance_issuance status=invalid_response' ]]; then
  printf '%s\n' "$result"
  exit 1
fi
unavailable
