#!/usr/bin/env bash
# Run from the authoritative Compose directory; credentials never leave the container.
set +x +v
set -euo pipefail
umask 077
unavailable() { printf '%s\n' 'cj_fulfillment status=unavailable'; exit 1; }
[[ $# -eq 0 ]] || unavailable
for binary in docker timeout flock; do command -v "$binary" >/dev/null 2>&1 || unavailable; done
{ exec 9>/run/lock/trbhh-cj-fulfillment.lock; } 2>/dev/null || unavailable
if ! flock -n 9; then printf '%s\n' 'cj_fulfillment status=skipped_overlap'; exit 0; fi
result=$(timeout 130s docker compose exec -T app node - 2>/dev/null <<'CJ_RUN_NODE'
(async()=>{
 const report=(ok,dispatched=0,checked=0)=>{process.stdout.write(ok?`cj_fulfillment status=ok dispatched=${dispatched} checked=${checked}\n`:'cj_fulfillment status=unavailable\n');process.exitCode=ok?0:1;};
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 if(secret.length<32){report(false);return;}
 try{
  async function call(path,key){const r=await fetch('http://127.0.0.1:3000/api/internal/cj/'+path,{method:'POST',headers:{Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(55000)});const body=await r.text();let d;try{d=JSON.parse(body);}catch{throw Error('invalid_response');}if(path==='fulfill-orders'&&r.status===503&&d.error==='cj_fulfillment_disabled')return 0;if(r.status!==200||!Number.isSafeInteger(d[key])||d[key]<0||d[key]>1)throw Error('unavailable');return d[key];}
  const enabled=process.env.CJ_ALLOW_LIVE_ORDERS==='true'&&process.env.CJ_FULFILLMENT_WORKER_ENABLED==='true'&&process.env.CJ_LIVE_TRIAL_ENABLED==='true';
  let dispatched=0,checked=0,ok=true;
  try{if(enabled)dispatched=await call('fulfill-orders','processed');}catch{ok=false;}
  // Existing shipment reads remain independent of a new order dispatch failure.
  try{checked=await call('fulfillment-status','checked');}catch{ok=false;}
  report(ok,dispatched,checked);
 }catch{report(false);}
})();
CJ_RUN_NODE
) || unavailable
[[ "$result" =~ ^cj_fulfillment\ status=ok\ dispatched=[01]\ checked=[01]$ ]] || unavailable
printf '%s\n' "$result"
