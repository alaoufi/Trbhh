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
    const text = await response.text();
    let payload; try { payload = JSON.parse(text); } catch { payload = null; }
    if (response.status !== 200) {
      const category = response.status === 503 && payload?.error === 'not_configured'
        ? '_not_configured'
        : response.status === 503 && /^[a-z0-9_]{1,64}$/.test(payload?.category || '')
        ? '_' + payload.category
        : response.status === 503 && response.headers.get('content-type')?.toLowerCase().includes('application/json')
          ? '_category_missing'
          : response.status === 503 ? '_non_json' : '';
      report('http_' + response.status + category); return;
    }
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
if [[ "$result" =~ ^finance_capture\ status=http_[1-5][0-9]{2}(_[a-z0-9_]{1,64})?$ ]] ||
   [[ "$result" == 'finance_capture status=not_configured' || "$result" == 'finance_capture status=invalid_response' ]]; then
  printf '%s\n' "$result"
  exit 1
fi
unavailable
