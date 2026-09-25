#!/usr/bin/env bash
# Exact-revision deployment. Caller owns the GitHub vps-deploy concurrency lock.
# Public HTTPS proof separates deploy from finalize. Rollback never imports SQL.
set +x +v
set -Eeuo pipefail
umask 077
if [[ $# != 3 || ! ${1:-} =~ ^(deploy|finalize|rollback)$ || ! ${2:-} =~ ^[1-9][0-9]{0,19}$ || ! ${3:-} =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Finance deployment arguments rejected. Expected MODE RUN_ID CANDIDATE_SHA.\n' >&2; exit 2
fi
mode=$1; run_id=$2; candidate=$3
prod=/root/trbhh
backup="/root/trbhh-release-backups/finance-$run_id"
tools_dir=$(cd "$(dirname "$0")" && pwd -P)
branch=claude/hostinger-vps-project-amw8vb
watchdog="trbhh-finance-rollback-$run_id"
active_release=/root/trbhh-release-tools/ACTIVE_DEPLOYMENT
stage=preflight; substep=preflight; mutated=0
exec 3>&1 4>&2
exec 2>/dev/null
trap 'printf "Finance deployment failed at stage %s substep %s.\n" "$stage" "$substep" >&4' ERR
[[ "$tools_dir" == "/root/trbhh-release-tools/$run_id" && "$(realpath "$prod")" == "$prod" ]]
exec >> "$tools_dir/deploy.log" 2>&1
exec 9> /run/lock/trbhh-finance-deploy.lock
flock -w 600 9
cd "$prod"
for helper in finance-backup.sh database-proof.cjs media-proof.cjs backup-capacity-proof.cjs supplier-preservation-proof.cjs verify-runtime.cjs finance-schema-check.cjs finance-capture-job.sh finance-media-reference.cjs merchant-media-reference.cjs; do
  [[ -f "$tools_dir/$helper" && ! -L "$tools_dir/$helper" ]]
done

verify_retained_media() {
  case "$(cat "$backup/media-mode.txt")" in
    fresh) [[ ! -e "$backup/FINANCE_MEDIA_REFERENCE.json" ]] ;;
    verified-parent|fresh-storage-retained-legacy) node "$tools_dir/finance-media-reference.cjs" verify "$backup" ;;
    *) return 1 ;;
  esac
}

# CAPTURE_UNITS_BEGIN
restore_capture_units() {
  [[ -f "$backup/CAPTURE_SNAPSHOT_READY" ]] || return 0
  systemctl stop trbhh-finance-capture.timer trbhh-finance-capture.service >/dev/null 2>&1 || true
  if [[ -f "$backup/UNIT_FILES_INSTALLED" ]]; then
    for unit in service timer; do
      local target="/etc/systemd/system/trbhh-finance-capture.$unit"
      [[ ! -L "$target" ]] || return 1
      # An interrupted pair installation or repeated rollback may leave the
      # original file (or original absence) already in place.
      if [[ -f "$backup/capture-$unit.old" ]] && cmp --silent "$target" "$backup/capture-$unit.old"; then continue; fi
      if [[ ! -e "$target" && ! -f "$backup/capture-$unit.old" ]]; then continue; fi
      cmp --silent "$target" "$backup/capture-$unit.new" || return 1
      if [[ -f "$backup/capture-$unit.old" ]]; then
        install -m 644 "$backup/capture-$unit.old" "$target" || return 1
      else
        rm -f -- "$target" || return 1
      fi
    done
    systemctl daemon-reload || return 1
  fi
  if [[ "$(cat "$backup/capture-enabled.txt")" == 1 ]]; then
    systemctl enable trbhh-finance-capture.timer >/dev/null || return 1
  elif [[ -f "$backup/UNIT_FILES_INSTALLED" ]]; then
    systemctl disable trbhh-finance-capture.timer >/dev/null 2>&1 || true
  fi
  if [[ "$(cat "$backup/capture-active.txt")" == 1 ]]; then systemctl start trbhh-finance-capture.timer || return 1; fi
}
# CAPTURE_UNITS_END

prepare_rollback_compose() {
  node - "$backup" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),dir=process.argv[2];
const m=JSON.parse(fs.readFileSync(path.join(dir,'compose-sources.json')));
if(!/^[a-z0-9][a-z0-9_-]*$/.test(m.project)||!Array.isArray(m.sourceFiles)||!m.sourceFiles.length)throw Error('rollback_compose');
const files=m.sourceFiles.map(f=>{if(!/^compose-source-[0-9]+\.yml$/.test(f.saved))throw Error('rollback_compose');return path.join(dir,f.saved);});
fs.writeFileSync(path.join(dir,'rollback-project.txt'),m.project+'\n');fs.writeFileSync(path.join(dir,'rollback-compose-files.txt'),files.join('\n')+'\n');
NODE
  local project source
  project=$(cat "$backup/rollback-project.txt")
  local -a original_compose=(docker compose --project-directory "$prod" --project-name "$project" --env-file "$backup/environment.env")
  while IFS= read -r source; do original_compose+=(-f "$source"); done < "$backup/rollback-compose-files.txt"
  "${original_compose[@]}" config --format json > "$backup/baseline-compose.json"
# BASELINE_CONFIG_BEGIN
node - "$backup" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),dir=process.argv[2];
const before=JSON.parse(fs.readFileSync(path.join(dir,'container-before.json')))[0],config=JSON.parse(fs.readFileSync(path.join(dir,'baseline-compose.json')));
const env=Object.fromEntries(before.Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const app=config.services?.app;if(!app||!app.environment)throw Error('rollback_config');
// `compose config --format json` doubles literal dollars for re-consumption.
// Compare that exact representation; never accept a changed runtime value.
const escapeDollar=value=>value.replaceAll('$',()=> '$$');
for(const [key,value] of Object.entries(app.environment))if(typeof value!=='string'||typeof env[key]!=='string'||escapeDollar(env[key])!==value)throw Error('unapplied_environment_drift');
const expected=(app.volumes||[]).map(v=>({Type:v.type,Source:v.type==='volume'?config.volumes?.[v.source]?.name:v.source,Destination:v.target,RW:!v.read_only}));
const actual=before.Mounts.map(v=>({Type:v.Type,Source:v.Type==='volume'?v.Name:v.Source,Destination:v.Destination,RW:v.RW}));
const sorted=v=>v.sort((a,b)=>a.Destination.localeCompare(b.Destination));assert.deepEqual(sorted(expected),sorted(actual),'unapplied_mount_drift');
// Inject the complete raw runtime env encoded once. Other fields are already
// rendered Compose values; escaping them again would alter commands/healthchecks.
app.environment=Object.fromEntries(Object.entries(env).map(([key,value])=>[key,escapeDollar(value)]));
app.image=fs.readFileSync(path.join(dir,'image-id.txt'),'utf8').trim();delete app.build;
fs.writeFileSync(path.join(dir,'rollback-compose.json'),JSON.stringify(config),{mode:0o600});
NODE
# BASELINE_CONFIG_END
}

rollback_app() {
  # A newer transaction must never be recovered by an older watchdog.
  [[ ! -L "$active_release" ]] || return 1
  if [[ -e "$active_release" ]]; then
    [[ "$(cat "$active_release")" == "$run_id" ]] || return 1
  else
    [[ -f "$backup/ROLLED_BACK" ]] || return 1
  fi
  [[ -f "$backup/VERIFIED" && ! -L "$backup" ]] || return 1
  [[ "$(cat "$backup/candidate.txt")" == "$candidate" ]] || return 1
  local original old_image running running_image= checkout project
  original=$(cat "$backup/commit.txt"); old_image=$(cat "$backup/image-id.txt")
  [[ "$original" =~ ^[0-9a-f]{40}$ && "$old_image" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  (cd "$backup" && sha256sum --check --status SHA256SUMS) || return 1
  checkout=$(git rev-parse HEAD)
  [[ "$checkout" == "$candidate" || "$checkout" == "$original" ]] || return 1
  running=$(docker compose ps -q app) || return 1
  if [[ -n "$running" ]]; then
    running_image=$(docker inspect -f '{{.Image}}' "$running") || return 1
    [[ "$running_image" == "$old_image" || ( -f "$backup/candidate-image-id.txt" && "$running_image" == "$(cat "$backup/candidate-image-id.txt")" ) ]] || return 1
  fi
  # Only this deployment's timer/units and checked-out revision may be restored.
  systemctl stop trbhh-finance-capture.timer trbhh-finance-capture.service >/dev/null 2>&1 || true
  git diff --cached --quiet || return 1
  local changed
  changed=$(git diff --name-only) || return 1
  [[ -z "$changed" || "$changed" == apps/android-twa/twa-manifest.json ]] || return 1
  git restore --source "$checkout" -- apps/android-twa/twa-manifest.json || return 1
  git -c core.hooksPath=/dev/null switch --detach "$original" || return 1
  cp "$backup/runtime-twa-manifest.json" apps/android-twa/twa-manifest.json || return 1
  project=$(cat "$backup/rollback-project.txt")
  local -a command=(docker compose --project-directory "$prod" --project-name "$project" -f "$backup/rollback-compose.json")
  if [[ "$running_image" != "$old_image" || "$(docker inspect -f '{{.State.Running}}' "$running")" != true ]]; then
    timeout 180s "${command[@]}" up -d --no-build --pull never --no-deps --force-recreate app || return 1
  fi
  running=$(docker compose ps -q app) || return 1
  [[ "$(docker inspect -f '{{.Image}}' "$running")" == "$old_image" ]] || return 1
  local healthy=0
  for attempt in $(seq 1 30); do
    if docker exec "$running" node -e 'fetch("http://127.0.0.1:3000/login",{redirect:"manual",signal:AbortSignal.timeout(4000)}).then(r=>{if(r.status<200||r.status>=400)process.exit(1)},()=>process.exit(1))'; then healthy=1; break; fi
    sleep 2
  done
  [[ "$healthy" == 1 ]] || return 1
  docker inspect "$running" > "$backup/container-rollback.json" || return 1
  node "$tools_dir/verify-runtime.cjs" "$backup/container-before.json" "$backup/container-rollback.json" merchant_oauth || return 1
  verify_retained_media || return 1
  # Healthy means preserved production data and disabled transaction gates,
  # not merely that the old application image responds. Never import SQL here.
  docker exec -i "$running" node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/rollback-database.json" || return 1
  node "$tools_dir/database-proof.cjs" verify "$backup/before.json" "$backup/rollback-database.json" || return 1
  docker exec -i "$running" node - snapshot < "$tools_dir/supplier-preservation-proof.cjs" > "$backup/rollback-supplier.json" || return 1
  node "$tools_dir/supplier-preservation-proof.cjs" verify "$backup/supplier-before.json" "$backup/rollback-supplier.json" || return 1
  docker exec -i "$running" node - <<'NODE' || return 1
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});
(async()=>{try{const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");if(rows.some(r=>!['0','false',null].includes(r.v))||process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false')throw Error('unsafe_gate');}catch{process.exitCode=1;}finally{await db.$disconnect();}})();
NODE
  for label in storage legacy; do
    [[ -f "$backup/$label.path" ]] || continue
    docker exec -i -u 0 "$running" node - snapshot "$(cat "$backup/$label.path")" < "$tools_dir/media-proof.cjs" > "$backup/$label-rollback.json" || return 1
    node "$tools_dir/media-proof.cjs" verify "$backup/$label-before.json" "$backup/$label-rollback.json" || return 1
  done
  # Unit restoration failures must not prevent recovery of the application.
  restore_capture_units || return 1
  systemctl stop "$watchdog.timer" >/dev/null 2>&1 || true
  printf '%s\n' "$original" > "$backup/ROLLED_BACK" || return 1
  if [[ -f "$active_release" && "$(cat "$active_release")" == "$run_id" ]]; then rm -f -- "$active_release" || return 1; fi
}

# A failed historical rollback can leave ACTIVE_DEPLOYMENT behind even after
# the old image is serving. Reclaim that marker only when the saved backup,
# checkout, running image, and in-container revision all prove the same
# baseline. Never restore SQL or alter application data here.
recover_stale_active_release() {
  [[ -e "$active_release" || -L "$active_release" ]] || return 0
  [[ -f "$active_release" && ! -L "$active_release" ]] || return 1
  local stale stale_backup stale_baseline stale_candidate stale_image running running_image stale_watchdog file
  stale=$(cat "$active_release") || return 1
  [[ "$stale" =~ ^[1-9][0-9]{0,19}$ && "$stale" != "$run_id" ]] || return 1
  stale_backup="/root/trbhh-release-backups/finance-$stale"
  [[ -d "$stale_backup" && ! -L "$stale_backup" ]] || return 1
  for file in VERIFIED commit.txt candidate.txt image-id.txt SHA256SUMS; do
    [[ -f "$stale_backup/$file" && ! -L "$stale_backup/$file" ]] || return 1
  done
  (cd "$stale_backup" && sha256sum --check --status SHA256SUMS) || return 1
  stale_baseline=$(cat "$stale_backup/commit.txt") || return 1
  stale_candidate=$(cat "$stale_backup/candidate.txt") || return 1
  stale_image=$(cat "$stale_backup/image-id.txt") || return 1
  [[ "$(cat "$stale_backup/VERIFIED")" == "$stale_baseline" ]] || return 1
  [[ "$stale_baseline" =~ ^[0-9a-f]{40}$ && "$stale_candidate" =~ ^[0-9a-f]{40}$ && "$stale_candidate" != "$stale_baseline" ]] || return 1
  [[ "$stale_image" =~ ^sha256:[0-9a-f]{64}$ && "$(git rev-parse HEAD)" == "$stale_baseline" ]] || return 1
  running=$(docker compose ps -q app) || return 1
  [[ "$running" =~ ^[0-9a-f]{12,64}$ ]] || return 1
  running_image=$(docker inspect -f '{{.Image}}' "$running") || return 1
  [[ "$running_image" == "$stale_image" && "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$running_image")" == "$stale_baseline" ]] || return 1
  docker exec -i "$running" node - "$stale_baseline" <<'NODE' || return 1
(async()=>{try{const r=await fetch('http://127.0.0.1:3000/api/version',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});if(r.status!==200||(await r.json()).commit!==process.argv[2])process.exit(1);}catch{process.exit(1);}})();
NODE
  docker exec -i "$running" node - <<'NODE' || return 1
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});
(async()=>{try{const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");if(rows.some(r=>!['0','false',null].includes(r.v))||process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false')throw Error('unsafe_gate');}catch{process.exitCode=1;}finally{await db.$disconnect();}})();
NODE
  stale_watchdog="trbhh-finance-rollback-$stale"
  systemctl stop "$stale_watchdog.timer" >/dev/null 2>&1 || true
  rm -f -- "$active_release" || return 1
  printf 'STALE_RELEASE_RECOVERED=true\n' >&3
}

finish() {
  local result=$?
  trap - EXIT
  set +e
  if [[ "$result" != 0 ]]; then
    local recovered=false
    if [[ "$mutated" == 1 && "$mode" != rollback ]]; then
      if rollback_app; then recovered=true; fi
    fi
    printf 'Finance deployment failed at stage %s; rollbackHealthy=%s. Database was not restored.\n' "$stage" "$recovered" >&4
  fi
  exit "$result"
}
trap - ERR
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

check_container() {
  [[ ! -e "$tools_dir/ROLLBACK_REQUESTED" ]] || return 1
  [[ "$(git rev-parse HEAD)" == "$candidate" ]] || return 1
  local container image
  container=$(docker compose ps -q app) || return 1
  [[ "$container" =~ ^[0-9a-f]{12,64}$ ]] || return 1
  image=$(docker inspect -f '{{.Image}}' "$container") || return 1
  [[ "$image" == "$(cat "$backup/candidate-image-id.txt")" ]] || return 1
  [[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$candidate" ]] || return 1
  docker exec -i "$container" node - "$candidate" <<'NODE' || return 1
(async()=>{try{const r=await fetch('http://127.0.0.1:3000/api/version',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});if(r.status!==200||!(r.headers.get('cache-control')||'').includes('no-store')||(await r.json()).commit!==process.argv[2])process.exit(1);}catch{process.exit(1);}})();
NODE
}

prove_preservation() {
  local container
  substep=preservation_media_preflight
  verify_retained_media
  substep=preservation_candidate_health
  check_container
  container=$(docker compose ps -q app)
  substep=preservation_commerce_schema
  docker exec -i "$container" node - < "$tools_dir/finance-schema-check.cjs"
  substep=preservation_runtime
  docker inspect "$container" > "$backup/container-after.json"
  node "$tools_dir/verify-runtime.cjs" "$backup/container-before.json" "$backup/container-after.json" merchant_oauth
# RUNTIME_ENV_PROOF_BEGIN
  node - "$backup/container-before.json" "$backup/container-after.json" <<'NODE'
const fs=require('node:fs'),env=file=>Object.fromEntries(JSON.parse(fs.readFileSync(file))[0].Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const before=env(process.argv[2]),after=env(process.argv[3]);
for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  if(key==='FINANCE_ISSUANCE_SECRET'&&before[key]===undefined&&after[key]==='')continue;
  if(!['FINANCE_CAPTURE_SECRET','NODE_VERSION','YARN_VERSION'].includes(key)&&before[key]!==after[key])throw Error('runtime_changed');
}
if((after.FINANCE_CAPTURE_SECRET||'').length<32||(before.FINANCE_CAPTURE_SECRET&&before.FINANCE_CAPTURE_SECRET!==after.FINANCE_CAPTURE_SECRET))throw Error('capture_secret_changed');
NODE
# RUNTIME_ENV_PROOF_END
  substep=preservation_database_snapshot
  docker exec -i "$container" node - snapshot < "$tools_dir/database-proof.cjs" > "$backup/after.json"
  substep=preservation_database_values
  node "$tools_dir/database-proof.cjs" verify "$backup/before.json" "$backup/after.json"
  substep=preservation_supplier_snapshot
  docker exec -i "$container" node - snapshot < "$tools_dir/supplier-preservation-proof.cjs" > "$backup/supplier-after.json"
  substep=preservation_supplier_values
  node "$tools_dir/supplier-preservation-proof.cjs" verify "$backup/supplier-before.json" "$backup/supplier-after.json"
  for label in storage legacy; do
    [[ -f "$backup/$label.path" ]] || continue
    substep=preservation_${label}_snapshot
    docker exec -i -u 0 "$container" node - snapshot "$(cat "$backup/$label.path")" < "$tools_dir/media-proof.cjs" > "$backup/$label-after.json"
    substep=preservation_${label}_values
    node "$tools_dir/media-proof.cjs" verify "$backup/$label-before.json" "$backup/$label-after.json"
  done
  substep=preservation_final_health
  check_container
}

if [[ "$mode" == rollback ]]; then
  if [[ -f "$backup/DEPLOYMENT_VERIFIED" && "$(cat "$backup/DEPLOYMENT_VERIFIED")" == "$candidate" ]]; then exit 0; fi
  stage=rollback
  if rollback_app; then
    printf 'ROLLBACK_HEALTHY=true\nRUN_ID=%s\n' "$run_id" >&3
    exit 0
  fi
  printf 'ROLLBACK_HEALTHY=false\nRUN_ID=%s\n' "$run_id" >&4
  exit 1
fi

if [[ "$mode" == deploy ]]; then
  stage=identity
  substep=recover_stale_release
  recover_stale_active_release
  substep=release_identity
  [[ ! -e "$active_release" && ! -L "$active_release" ]]
  [[ ! -e "$backup" && ! -L "$backup" ]]
  baseline=$(git rev-parse HEAD)
  [[ "$baseline" =~ ^[0-9a-f]{40}$ && "$baseline" != "$candidate" ]]
  git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  [[ "$(git rev-parse "refs/remotes/origin/$branch")" == "$candidate" ]]
  git merge-base --is-ancestor "$baseline" "$candidate"
  stage=backup
  # Preserve only the backup script's sanitized stage message on fd 4; all
  # raw database/configuration diagnostics remain in its private operations log.
  bash "$tools_dir/finance-backup.sh" "$run_id" "$candidate" "$baseline" >&3 2>&4
  [[ "$(cat "$backup/VERIFIED")" == "$baseline" && "$(cat "$backup/candidate.txt")" == "$candidate" ]]
  (cd "$backup" && sha256sum --check --status SHA256SUMS)
  verify_retained_media
  stage=runtime_preflight
  prepare_rollback_compose
  # Preserve pre-existing timer configuration before stopping it for cutover.
  for unit in service timer; do
    source="/etc/systemd/system/trbhh-finance-capture.$unit"
    [[ ! -L "$source" ]]
    if [[ -f "$source" ]]; then cp "$source" "$backup/capture-$unit.old"; fi
  done
  enabled=0; active=0
  if systemctl is-enabled --quiet trbhh-finance-capture.timer; then enabled=1; fi
  if systemctl is-active --quiet trbhh-finance-capture.timer; then active=1; fi
  printf '%s\n' "$enabled" > "$backup/capture-enabled.txt"
  printf '%s\n' "$active" > "$backup/capture-active.txt"
  touch "$backup/CAPTURE_SNAPSHOT_READY"
  printf '%s\n' "$run_id" > "$active_release"
  mutated=1
  # Arm before changing the checkout or stopping capture; cancellation during
  # the build is recoverable as well as cancellation after the app is replaced.
  systemd-run --unit="$watchdog" --on-active=15m /bin/bash -c 'test ! -f "$1/DEPLOYMENT_VERIFIED" || exit 0; touch "$2/ROLLBACK_REQUESTED"; exec /bin/bash "$2/finance-deploy.sh" rollback "$3" "$4"' sh "$backup" "$tools_dir" "$run_id" "$candidate" >/dev/null
  systemctl stop trbhh-finance-capture.timer trbhh-finance-capture.service >/dev/null 2>&1 || true
  stage=checkout
  git restore --source "$baseline" -- apps/android-twa/twa-manifest.json
  git -c core.hooksPath=/dev/null merge --ff-only "$candidate"
  cp "$backup/runtime-twa-manifest.json" apps/android-twa/twa-manifest.json
  [[ "$(git rev-parse HEAD)" == "$candidate" ]]
  docker compose config --format json > "$backup/candidate-config.json"
# CAPTURE_ENV_BEGIN
node - "$prod" "$backup" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [prod,backup]=process.argv.slice(2),file=path.join(prod,'.env');
const source=fs.readFileSync(file,'utf8'),lines=source.split(/(?<=\n)/),key=/^\s*(?:export\s+)?FINANCE_CAPTURE_SECRET\s*=/;
const matches=lines.map((line,index)=>key.test(line)?index:-1).filter(index=>index>=0);
if(matches.length>1)throw Error('duplicate_capture_setting');
const config=JSON.parse(fs.readFileSync(path.join(backup,'candidate-config.json'))),existing=config.services?.app?.environment?.FINANCE_CAPTURE_SECRET||'';
if(typeof existing!=='string'||/[\r\n]/.test(existing)||(existing.length>0&&existing.length<32))throw Error('invalid_capture_setting');
if(!existing){
  const secret=crypto.randomBytes(32).toString('hex');
  if(matches.length){const at=matches[0],ending=lines[at].endsWith('\r\n')?'\r\n':lines[at].endsWith('\n')?'\n':'';lines[at]='FINANCE_CAPTURE_SECRET='+secret+ending;}
  else lines.push((source&&!source.endsWith('\n')?'\n':'')+'FINANCE_CAPTURE_SECRET='+secret+'\n');
  const temp=file+'.finance-'+crypto.randomBytes(8).toString('hex');fs.writeFileSync(temp,lines.join(''),{flag:'wx',mode:0o600});fs.renameSync(temp,file);
}
NODE
# CAPTURE_ENV_END
  stage=build
  image="trbhh-finance:$candidate"
  # Build only the reviewed commit's files. Host .env files, ignored/untracked
  # source and the runtime-only Android manifest can never enter this context.
# BUILD_IMAGE_BEGIN
  git archive --format=tar "$candidate" | docker build --build-arg "TRBHH_RELEASE_COMMIT=$candidate" --tag "$image" -
# BUILD_IMAGE_END
  image_id=$(docker image inspect -f '{{.Id}}' "$image")
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$candidate" ]]
  printf '%s\n' "$image_id" > "$backup/candidate-image-id.txt"
  printf 'services:\n  app:\n    image: %s\n' "$image_id" > "$backup/candidate-image.yml"
  git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  [[ "$(git rev-parse "refs/remotes/origin/$branch")" == "$candidate" ]]
  stage=cutover
  [[ ! -e "$tools_dir/ROLLBACK_REQUESTED" ]]
  timeout 180s docker compose -f docker-compose.yml -f "$backup/candidate-image.yml" up -d --no-build --pull never --no-deps --force-recreate app
  ready=0
  for attempt in $(seq 1 45); do if check_container; then ready=1; break; fi; sleep 2; done
  [[ "$ready" == 1 ]]
  stage=preservation
  prove_preservation
  printf '%s\n' "$candidate" > "$backup/CUTOVER_READY"
  printf 'CUTOVER_READY=%s\nRUN_ID=%s\n' "$candidate" "$run_id" >&3
  exit 0
fi

stage=finalize; substep=finalize_preflight
[[ -f "$active_release" && ! -L "$active_release" && "$(cat "$active_release")" == "$run_id" ]]
[[ -f "$backup/CUTOVER_READY" && "$(cat "$backup/CUTOVER_READY")" == "$candidate" ]]
[[ ! -e "$backup/DEPLOYMENT_VERIFIED" ]]
mutated=1
substep=finalize_health_check
check_container
container=$(docker compose ps -q app)
substep=finance_schema_check
docker exec -i "$container" node - < "$tools_dir/finance-schema-check.cjs"
# FINALIZE_WORKER: caller has now verified public HTTPS outside the SSH host.
for attempt in 1 2; do
  substep=finance_capture_attempt_$attempt
  if result=$(bash "$tools_dir/finance-capture-job.sh"); then
    if [[ ! "$result" =~ ^finance_capture\ status=ok\ captured=[0-9]+$ ]]; then
      if [[ "$result" =~ ^finance_capture\ status=([a-z0-9_]+)(\ captured=[0-9]+)?$ ]]; then capture_status=${BASH_REMATCH[1]}; else capture_status=unexpected_output; fi
      printf 'Finance receipt capture blocked finalization; status=%s.\n' "$capture_status" >&4
      exit 1
    fi
  else
    if [[ "$result" =~ ^finance_capture\ status=([a-z0-9_]+)(\ captured=[0-9]+)?$ ]]; then capture_status=${BASH_REMATCH[1]}; else capture_status=unavailable; fi
    printf 'Finance receipt capture failed finalization; status=%s.\n' "$capture_status" >&4
    exit 1
  fi
  printf '%s\n' "$result" >&3
done
substep=post_capture_preservation
prove_preservation
substep=prepare_capture_units
cat > "$backup/capture-service.new" <<UNIT
# trbhh-finance-release=$run_id
[Unit]
Description=Capture verified receipt snapshots for Trbhh
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
WorkingDirectory=$prod
ExecStart=/bin/bash $tools_dir/finance-capture-job.sh
TimeoutStartSec=90
NoNewPrivileges=true
PrivateTmp=true
UNIT
cat > "$backup/capture-timer.new" <<'UNIT'
[Unit]
Description=Capture Trbhh receipt snapshots every five minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=15s
Unit=trbhh-finance-capture.service
[Install]
WantedBy=timers.target
UNIT
# Mark before installation, so even a partially installed pair is recoverable.
touch "$backup/UNIT_FILES_INSTALLED"
substep=install_capture_units
for unit in service timer; do
  [[ ! -L "/etc/systemd/system/trbhh-finance-capture.$unit" ]]
  install -m 644 "$backup/capture-$unit.new" "/etc/systemd/system/trbhh-finance-capture.$unit"
done
systemctl daemon-reload
substep=enable_capture_timer
systemctl enable --now trbhh-finance-capture.timer
systemctl is-active --quiet trbhh-finance-capture.timer
substep=final_container_check
check_container
substep=stop_rollback_watchdog
systemctl stop "$watchdog.timer"
systemctl stop "$watchdog.service" >/dev/null 2>&1 || true
[[ ! -e "$tools_dir/ROLLBACK_REQUESTED" ]]
substep=write_verified_marker
printf '%s\n' "$candidate" > "$backup/DEPLOYMENT_VERIFIED"
rm -f -- "$active_release"
printf 'DEPLOYMENT_VERIFIED=%s\nRUN_ID=%s\nCAPTURE_TIMER_ENABLED=true\n' "$candidate" "$run_id" >&3
