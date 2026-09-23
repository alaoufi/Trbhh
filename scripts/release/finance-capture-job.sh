#!/usr/bin/env bash
# Operator-only host job. Run from the authoritative Compose project directory.
# The credential is read inside the running app container, never by this shell.
set +x +v
set -euo pipefail
umask 077

unavailable() { printf '%s\n' 'finance_capture status=unavailable'; exit 1; }
[[ $# -eq 0 ]] || unavailable
for executable in docker flock timeout; do
  command -v "$executable" >/dev/null 2>&1 || unavailable
done
{ exec 9>/run/lock/trbhh-finance-capture.lock; } 2>/dev/null || unavailable
if flock -n 9; then
  :
else
  lock_status=$?
  [[ "$lock_status" -eq 1 ]] || unavailable
  printf '%s\n' 'finance_capture status=skipped_overlap'
  exit 0
fi

docker_status=0
result=$(timeout 75s docker compose exec -T app node - 2>/dev/null <<'FINANCE_CAPTURE_NODE'
(async () => {
  const report = (status, captured) => {
    process.stdout.write('finance_capture status=' + status + (captured === undefined ? '' : ' captured=' + captured) + '\n');
    process.exitCode = status === 'ok' ? 0 : 1;
  };
  const secret = process.env.FINANCE_CAPTURE_SECRET || '';
  if (secret.length < 32) { report('not_configured'); return; }
  try {
    const response = await fetch('http://127.0.0.1:3000/api/internal/finance/capture', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + secret},
      redirect: 'error',
      signal: AbortSignal.timeout(55000),
    });
    if (response.status !== 200) { report('http_' + response.status); return; }
    const payload = await response.json();
    if (!Number.isSafeInteger(payload?.captured) || payload.captured < 0) { report('invalid_response'); return; }
    report('ok', payload.captured);
  } catch {
    report('unavailable');
  }
})();
FINANCE_CAPTURE_NODE
) || docker_status=$?

# Docker/Compose failures may contain private diagnostics. Only this whitelist
# reaches the host journal; response bodies and exception messages never do.
if [[ "$docker_status" -eq 0 && "$result" =~ ^finance_capture\ status=ok\ captured=[0-9]+$ ]]; then
  printf '%s\n' "$result"
  exit 0
fi
if [[ "$result" =~ ^finance_capture\ status=http_[1-5][0-9]{2}$ ]] ||
   [[ "$result" == 'finance_capture status=not_configured' || "$result" == 'finance_capture status=invalid_response' ]]; then
  printf '%s\n' "$result"
  exit 1
fi
unavailable
