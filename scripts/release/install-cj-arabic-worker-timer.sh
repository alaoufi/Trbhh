#!/usr/bin/env bash
# Install separately after exact candidate deployment; leaves all database flags unchanged.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]]
candidate=$1
[[ $candidate =~ ^[a-f0-9]{40}$ ]]
exec 9>/run/lock/trbhh-finance-deploy.lock
flock -n 9
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
service=trbhh-cj-arabic-worker.service
timer=trbhh-cj-arabic-worker.timer
runner=/usr/local/libexec/trbhh-cj-arabic-worker
[[ ! -L /etc/systemd/system && ! -L /usr/local/libexec && ! -L /root/trbhh-release-tools ]]
[[ $(systemctl show -p ActiveState --value "$service" 2>/dev/null || true) != activating ]]
[[ $(systemctl show -p ActiveState --value "$service" 2>/dev/null || true) != active ]]
# Validate secret availability entirely inside the app; never send it to the host shell.
docker exec trbhh-app timeout 5 node -e '(async()=>{if((process.env.SUPPLIER_RECONCILE_SECRET||"").length<32)throw Error();const r=await fetch("http://127.0.0.1:3000/api/version",{signal:AbortSignal.timeout(3000)});if(!r.ok||(await r.json()).commit!==process.argv[1])throw Error();})().catch(()=>process.exit(1))' "$candidate"
backup=/root/trbhh-release-tools/cj-arabic-timer-$(date +%s)
[[ ! -e $backup ]]
mkdir -m 700 "$backup"
paths=("/etc/systemd/system/$service" "/etc/systemd/system/$timer" "$runner")
declare -a present
for i in "${!paths[@]}"; do
  path=${paths[$i]}
  [[ ! -L $path ]]
  if [[ -e $path ]]; then [[ -f $path && $(stat -c %u "$path") == 0 ]]; cp -p -- "$path" "$backup/$i"; present[$i]=1; else present[$i]=0; fi
done
enabled=$(systemctl is-enabled "$timer" 2>/dev/null || true)
active=0; if systemctl is-active --quiet "$timer"; then active=1; fi
printf '%s\n' "$enabled" > "$backup/enabled"
printf '%s\n' "$active" > "$backup/active"
printf '%s\n' "${paths[@]}" > "$backup/paths"
printf '%s\n' "${present[@]}" > "$backup/present"
restore(){
  status=$?; trap - EXIT
  if [[ $status != 0 ]]; then
    systemctl stop "$timer" || true
    for i in "${!paths[@]}"; do
      if [[ ${present[$i]} == 1 ]]; then cp -p -- "$backup/$i" "${paths[$i]}"; else rm -f -- "${paths[$i]}"; fi
    done
    systemctl daemon-reload
    if [[ $enabled == enabled ]]; then systemctl enable "$timer"; else systemctl disable "$timer" || true; fi
    if [[ $active == 1 ]]; then systemctl start "$timer"; fi
    echo TIMER_INSTALL_FAILED_PREVIOUS_CONFIGURATION_RESTORED >&2
  fi
  exit "$status"
}
trap restore EXIT
systemctl stop "$timer" 2>/dev/null || true
state=$(systemctl show -p ActiveState --value "$service" 2>/dev/null || true)
[[ $state != active && $state != activating && $state != deactivating ]]
install -d -m 755 /usr/local/libexec
cat > "$runner" <<'RUNNER'
#!/usr/bin/env bash
set -Eeuo pipefail
exec 9>/run/lock/trbhh-cj-arabic-worker.lock
flock -n 9 || exit 0
# One authenticated bounded queue job; the application enforces its disabled-by-default flag.
docker exec -i trbhh-app timeout --signal=TERM --kill-after=1s 58s nice -n 15 node - <<'NODE'
(async()=>{
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';if(secret.length<32)throw Error('worker_not_configured');
 const response=await fetch('http://127.0.0.1:3000/api/internal/cj/translate',{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{authorization:'Bearer '+secret}});
 if(!response.ok)throw Error('worker_http_'+response.status);
 const result=await response.json();if(result.ok!==true||!result.worker||!Number.isInteger(result.worker.completed)||result.worker.completed<0||result.worker.completed>1)throw Error('invalid_worker_response');
 console.log(JSON.stringify({event:'CJ_ARABIC_WORKER_TICK',completed:result.worker.completed,status:String(result.worker.status).slice(0,40)}));
})().catch(()=>{console.error('CJ_ARABIC_WORKER_TICK_FAILED');process.exitCode=1;});
NODE
RUNNER
chmod 755 "$runner"
cat > "/etc/systemd/system/$service" <<'SERVICE'
[Unit]
Description=One bounded queued Arabic text translation
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/libexec/trbhh-cj-arabic-worker
TimeoutStartSec=60s
Nice=15
UMask=0077
SERVICE
cat > "/etc/systemd/system/$timer" <<'TIMER'
[Unit]
Description=Check Arabic text translation queue every minute
[Timer]
OnBootSec=1min
OnUnitInactiveSec=60s
AccuracySec=1s
Unit=trbhh-cj-arabic-worker.service
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now "$timer"
systemctl is-active --quiet "$timer"
echo "CJ_ARABIC_TIMER_INSTALLED FLAGS_UNCHANGED=1 BACKUP=$backup"
