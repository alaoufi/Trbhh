#!/usr/bin/env bash
# Explicit cache maintenance only. Deployment never invokes this entrypoint.
set +x +v
set -Eeuo pipefail
umask 077
if [[ $# != 3 || ! ${1:-} =~ ^cache-(audit|cleanup)$ || ! ${2:-} =~ ^[1-9][0-9]{0,19}$ || ! ${3:-} =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Finance cache arguments rejected. Expected MODE RUN_ID BASELINE_SHA.\n' >&2; exit 2
fi
mode=$1; run_id=$2; baseline=$3
prod=/root/trbhh; base=/root/trbhh-release-cache-ops; private="$base/$run_id"
stage=preflight; armed=0
exec 3>&1 4>&2
exec 2>/dev/null
trap 'printf "Finance cache operation failed at stage %s.\n" "$stage" >&4' ERR
[[ "$(realpath "$prod")" == "$prod" && ! -L "$base" ]]
exec 9> /run/lock/trbhh-finance-deploy.lock
flock -w 60 9
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT && ! -L /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
cd "$prod"
[[ "$(git rev-parse HEAD)" == "$baseline" ]]
[[ ! -e "$private" && ! -L "$private" ]]
mkdir -p "$base"; chmod 700 "$base"
mkdir -m 700 "$private"
exec >> "$private/operations.log" 2>&1

snapshot_runtime() {
  local output=$1 reference=${2:-} current container
  current=$(git rev-parse HEAD) || return 1
  container=$(docker compose ps -q app) || return 1
  [[ "$container" =~ ^[0-9a-f]{12,64}$ ]] || return 1
  docker inspect "$container" > "$private/$output-container.json" || return 1
  node - "$private/$output-container.json" "$current" "$baseline" "$reference" > "$private/$output-runtime.json" <<'NODE' || return 1
// CACHE_RUNTIME_BEGIN
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const [file,current,baseline,reference]=process.argv.slice(2),c=JSON.parse(fs.readFileSync(file))[0];
if(!/^[a-f0-9]{40}$/.test(current)||current!==baseline||!c||!/^[a-f0-9]{64}$/.test(c.Id)||!/^sha256:[a-f0-9]{64}$/.test(c.Image)||c.State?.Running!==true||c.State?.Paused!==false||c.Config?.Labels?.['com.docker.compose.service']!=='app'||c.Config.Labels['com.docker.compose.project.working_dir']!=='/root/trbhh'||!c.Config.Env.includes('SUPPLIER_ALLOW_LIVE_ORDERS=false'))throw Error('runtime_identity');
const runtime={env:[...c.Config.Env].sort(),mounts:[...c.Mounts].sort((a,b)=>a.Destination.localeCompare(b.Destination)),startedAt:c.State.StartedAt};
const result={baseline:current,containerId:c.Id,imageId:c.Image,runtimeSha256:crypto.createHash('sha256').update(JSON.stringify(runtime)).digest('hex'),running:true,paused:false};
if(reference)assert.deepEqual(result,JSON.parse(fs.readFileSync(reference)),'runtime_changed');
process.stdout.write(JSON.stringify(result)+'\n');
// CACHE_RUNTIME_END
NODE
  timeout 15s docker exec "$container" node -e 'fetch("http://127.0.0.1:3000/login",{redirect:"manual",signal:AbortSignal.timeout(10000)}).then(r=>{if(r.status<200||r.status>=400)process.exit(1)},()=>process.exit(1))' || return 1
}

collect_inventory() {
  local label=$1 root
  root=$(docker info --format '{{.DockerRootDir}}') || return 1
  [[ "$root" == /* && -d "$root" ]] || return 1
  df -B1 --output=size,used,avail "$prod" "$root" > "$private/$label-df.txt" || return 1
  timeout 90s docker system df --format '{{json .}}' > "$private/$label-docker.jsonl" || return 1
  # Build cache record descriptions may contain build arguments. Retain the
  # complete inventory privately; publish only totals and its fingerprint.
  timeout 90s docker system df --verbose > "$private/$label-docker-verbose.txt" || return 1
  node - "$private" "$label" > "$private/$label-inventory.json" <<'NODE' || return 1
// CACHE_INVENTORY_BEGIN
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),[dir,label]=process.argv.slice(2);
const read=name=>fs.readFileSync(path.join(dir,label+'-'+name),'utf8');
const count=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error('inventory_count');return n;};
const size=value=>{const match=String(value).match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|kB|KB|MB|GB|TB)(?:\s+\([0-9.]+%\))?$/);if(!match)throw Error('inventory_size');return count(Math.round(Number(match[1])*({B:1,kB:1e3,KB:1e3,MB:1e6,GB:1e9,TB:1e12}[match[2]])));};
const slots=['production','docker'],filesystems=read('df.txt').trim().split(/\r?\n/).slice(1).map((line,i)=>{const values=line.trim().split(/\s+/);if(values.length!==3||!slots[i])throw Error('inventory_filesystem');return {slot:slots[i],totalBytes:count(values[0]),usedBytes:count(values[1]),freeBytes:count(values[2])};});
if(filesystems.length!==2)throw Error('inventory_filesystem');
const types={'Images':'images','Containers':'containers','Local Volumes':'volumes','Build Cache':'buildCache'};
const docker=read('docker.jsonl').trim().split(/\r?\n/).map(line=>{const row=JSON.parse(line);if(!types[row.Type])throw Error('inventory_type');return {type:types[row.Type],totalCount:count(row.TotalCount),activeCount:count(row.Active),sizeBytes:size(row.Size),reclaimableBytes:size(row.Reclaimable)};});
if(docker.length!==4||new Set(docker.map(r=>r.type)).size!==4)throw Error('inventory_types');
const inventorySha256=crypto.createHash('sha256').update(read('docker-verbose.txt')).digest('hex');
process.stdout.write(JSON.stringify({filesystems,docker,inventorySha256})+'\n');
// CACHE_INVENTORY_END
NODE
}

verify_unchanged() { snapshot_runtime after "$private/before-runtime.json"; }
publish_report() {
  node - "$private" "$mode" "$run_id" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),[dir,mode,runId]=process.argv.slice(2);
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
console.log(JSON.stringify({operation:mode,runId,runtime:read('after-runtime'),before:read('before-inventory'),after:read('after-inventory')}));
NODE
}

# CACHE_FINISH_BEGIN
finish() {
  local result=$?
  trap - EXIT
  set +e
  if [[ "$armed" == 1 ]]; then
    if verify_unchanged; then printf 'CACHE_RUNTIME_UNCHANGED=true\n' >&3; else result=1; fi
    collect_inventory after || result=1
  fi
  if [[ "$result" == 0 && "$stage" == complete ]]; then
    publish_report >&3 || result=1
    if [[ "$result" == 0 ]]; then printf 'CACHE_OPERATION_VERIFIED=%s\nRUN_ID=%s\n' "$mode" "$run_id" >&3; fi
  fi
  if [[ "$result" != 0 ]]; then printf 'Finance cache operation failed at stage %s; no completion proof issued.\n' "$stage" >&4; fi
  exit "$result"
}
# CACHE_FINISH_END
trap - ERR
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
stage=runtime_before
snapshot_runtime before
armed=1
stage=inventory_before
collect_inventory before
# CACHE_ACTION_BEGIN
if [[ "$mode" == cache-cleanup ]]; then
  stage=builder_cache
  timeout 600s docker builder prune --all --force --filter until=24h > "$private/builder-prune.log" 2>&1
fi
# CACHE_ACTION_END
stage=complete
