#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
candidate=46d7d108ff1511c3f991eff645050152481e7adb
baseline=35ac47b1c0b8768a65a14ca8388e2f4febc53c99
branch=codex/admin-navigation-complete-20261014
[[ $(id -u) == 0 ]]
[[ $candidate =~ ^[a-f0-9]{40}$ ]] || { echo CANDIDATE_NOT_PINNED >&2; exit 1; }
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh ]]
if [[ ${1:-} != --run ]]; then
  [[ ${1:-} =~ ^[a-f0-9]{40}$ ]]
  revision=$1
  reference=${2:-}
  [[ -z $reference || $reference =~ ^/root/trbhh-release-tools/code-only-[0-9]+/before.json$ ]]
  run_id=$(date +%s)
  target=/root/trbhh-release-tools/semantic-search-deploy-$run_id
  [[ ! -e $target ]]
  mkdir -m 700 "$target"
  for file in manual-semantic-search-deploy.sh code-only-compose.cjs verify-runtime.cjs local-semantic-benchmark.cjs; do
    git show "$revision:scripts/release/$file" > "$target/$file"
  done
  bash -n "$target/manual-semantic-search-deploy.sh"
  touch "$target/result.log"
  systemd-run --unit="trbhh-semantic-search-deploy-$run_id" --property=Type=exec /bin/bash "$target/manual-semantic-search-deploy.sh" --run "$target" "$reference"
  printf 'RUN_ID=%s\nRESULT: tail -n 30 %s/result.log\n' "$run_id" "$target"
  (
    while systemctl is-active --quiet "trbhh-semantic-search-deploy-$run_id.service"; do sleep 3; done
  ) &
  watcher=$!
  tail --pid="$watcher" -n 12 -f "$target/result.log"
  wait "$watcher"
  ! systemctl is-failed --quiet "trbhh-semantic-search-deploy-$run_id.service"
  exit 0
fi
target=${2:?}
[[ $target =~ ^/root/trbhh-release-tools/semantic-search-deploy-[0-9]+$ && -d $target && ! -L $target ]]
exec > "$target/result.log" 2>&1
exec 9>/run/lock/trbhh-finance-deploy.lock
flock -n 9
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
[[ $(git rev-parse HEAD) == "$baseline" ]]
git diff --cached --quiet
[[ -z $(git diff --name-only | sed '/^apps\/android-twa\/twa-manifest.json$/d') ]]
git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"
[[ $(git rev-parse "refs/remotes/origin/$branch") == "$candidate" ]]
git merge-base --is-ancestor "$baseline" "$candidate"
# This release changes application code only. Infrastructure and migration drift fails closed.
git diff --quiet "$baseline" "$candidate" -- Dockerfile docker-compose.yml .dockerignore prisma src/instrumentation.ts src/lib/db scripts/docker-entrypoint.sh scripts/migrate.mjs scripts/migrations
env_hash=$(sha256sum .env | cut -d' ' -f1)
container=$(docker compose ps -q app)
[[ -n $container ]]
docker inspect "$container" > "$target/current.json"
reference=${3:-}
if [[ -n $reference ]]; then
  [[ $reference =~ ^/root/trbhh-release-tools/code-only-[0-9]+/before.json$ && -f $reference && ! -L $reference ]]
  cp "$reference" "$target/before.json"
  node - "$target/before.json" "$target/current.json" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const a=JSON.parse(fs.readFileSync(process.argv[2]))[0],b=JSON.parse(fs.readFileSync(process.argv[3]))[0];
const mounts=c=>c.Mounts.map(({Type,Name,Source,Destination,RW})=>({Type,Name,Source,Destination,RW})).sort((x,y)=>x.Destination.localeCompare(y.Destination));
try{assert.equal(a.Image,b.Image);assert.deepEqual(mounts(a),mounts(b));}catch{console.error('Prior runtime does not match the restored image and mounts; values withheld.');process.exit(1);}
NODE
else
  cp "$target/current.json" "$target/before.json"
fi
old_image=$(docker inspect -f '{{.Image}}' "$container")
[[ $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$old_image") == "$baseline" ]]
project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]]
docker compose config --format json > "$target/config.json"
node "$target/code-only-compose.cjs" "$target/config.json" "$target/before.json" "$old_image" "$target/rollback.json"
switched=0
ai_timer_installed=0
search_timer_installed=0
timer_snapshot_ready=0
timers_touched=0
timer_paths=(
 /etc/systemd/system/trbhh-semantic-index-refresh.service
 /etc/systemd/system/trbhh-semantic-index-refresh.timer
 /usr/local/libexec/trbhh-semantic-index-refresh
)
timer_units=(trbhh-semantic-index-refresh.service trbhh-semantic-index-refresh.timer)
declare -a timer_present timer_enabled timer_active
snapshot_timers(){
  local i path unit state
  [[ ! -L /etc/systemd/system && ! -L /usr/local/libexec ]]
  # Existing oneshots must not be overwritten, even when waiting on one of our locks.
  for unit in trbhh-semantic-index-refresh.service; do
    state=$(systemctl show -p ActiveState --value "$unit" 2>/dev/null || true)
    [[ $state != active && $state != activating && $state != deactivating && $state != reloading ]]
  done
  mkdir -m 700 "$target/timer-before"
  for i in "${!timer_paths[@]}"; do
    path=${timer_paths[$i]}
    [[ ! -L $path ]]
    if [[ -e $path ]]; then
      [[ -f $path && $(stat -c %u "$path") == 0 ]]
      cp -p -- "$path" "$target/timer-before/$i"
      timer_present[$i]=1
    else timer_present[$i]=0; fi
  done
  for i in "${!timer_units[@]}"; do
    unit=${timer_units[$i]}
    timer_enabled[$i]=$(systemctl is-enabled "$unit" 2>/dev/null || true)
    timer_active[$i]=0
    if systemctl is-active --quiet "$unit"; then timer_active[$i]=1; fi
  done
  timer_snapshot_ready=1
  timers_touched=1
  # Stop timer triggers before replacing units; preserve their original active states above.
  for unit in trbhh-semantic-index-refresh.timer; do
    if [[ $(systemctl show -p LoadState --value "$unit" 2>/dev/null || true) != not-found ]]; then systemctl stop "$unit"; fi
  done
  for unit in trbhh-semantic-index-refresh.service; do
    state=$(systemctl show -p ActiveState --value "$unit" 2>/dev/null || true)
    [[ $state != active && $state != activating && $state != deactivating && $state != reloading ]]
  done
}
restore_timers(){
  local i path unit state failed=0
  for unit in "${timer_units[@]}"; do
    if [[ $(systemctl show -p LoadState --value "$unit" 2>/dev/null || true) != not-found ]]; then systemctl stop "$unit" || failed=1; fi
    systemctl disable "$unit" >/dev/null 2>&1 || true
    systemctl disable --runtime "$unit" >/dev/null 2>&1 || true
  done
  for i in "${!timer_paths[@]}"; do
    path=${timer_paths[$i]}
    if [[ -L $path ]]; then failed=1; continue; fi
    if [[ ${timer_present[$i]} == 1 ]]; then
      cp -p -- "$target/timer-before/$i" "$path" || failed=1
    elif [[ -e $path ]]; then
      [[ -f $path ]] && rm -f -- "$path" || failed=1
    fi
  done
  systemctl daemon-reload || failed=1
  for i in "${!timer_units[@]}"; do
    unit=${timer_units[$i]};state=${timer_enabled[$i]}
    case $state in
      enabled) systemctl enable "$unit" >/dev/null 2>&1 || failed=1 ;;
      enabled-runtime) systemctl enable --runtime "$unit" >/dev/null 2>&1 || failed=1 ;;
    esac
    if [[ ${timer_active[$i]} == 1 ]]; then systemctl start "$unit" || failed=1; fi
    [[ $(systemctl is-enabled "$unit" 2>/dev/null || true) == "$state" ]] || failed=1
    if systemctl is-active --quiet "$unit"; then [[ ${timer_active[$i]} == 1 ]] || failed=1; else [[ ${timer_active[$i]} == 0 ]] || failed=1; fi
  done
  for i in "${!timer_paths[@]}"; do
    if [[ ${timer_present[$i]} == 1 ]]; then cmp -s "$target/timer-before/$i" "${timer_paths[$i]}" || failed=1; else [[ ! -e ${timer_paths[$i]} && ! -L ${timer_paths[$i]} ]] || failed=1; fi
  done
  [[ $failed == 0 ]] && echo TIMER_STATE_RESTORED=true || { echo TIMER_STATE_RESTORED=false; return 1; }
}
finish(){
  result=$?
  trap - EXIT
  if [[ $result != 0 && $timer_snapshot_ready == 1 && $timers_touched == 1 ]]; then restore_timers || true; fi
  if [[ $result != 0 && $switched == 1 ]]; then
    echo 'Deployment failed; restoring the previous application image only.'
    if timeout 180s docker compose --project-directory /root/trbhh --project-name "$project" -f "$target/rollback.json" up -d --no-build --pull never --no-deps --force-recreate app && git switch --detach "$baseline"; then
      rollback_healthy=0
      rollback_deadline=$((SECONDS+120))
      while (( SECONDS+18 <= rollback_deadline )); do
        restored=$(timeout 5s docker compose ps -q app 2>/dev/null || true)
        if [[ -n $restored ]] && [[ $(timeout 5s docker inspect -f '{{.Image}}' "$restored" 2>/dev/null || true) == "$old_image" ]] && timeout 6s docker exec "$restored" timeout 5 node -e 'fetch("http://127.0.0.1:3000/api/version",{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)throw Error("http");return r.json();}).then(j=>process.exit(j.commit===process.argv[1]?0:1)).catch(()=>process.exit(1))' "$baseline"; then
          rollback_healthy=1; break
        fi
        sleep 2
      done
      if [[ $rollback_healthy == 1 ]]; then echo ROLLBACK_HEALTHY=true; else echo 'ROLLBACK_HEALTHY=false — operator action required.'; fi
    else
      echo 'ROLLBACK_HEALTHY=false — rollback command failed; operator action required.'
    fi
  fi
  exit "$result"
}
trap finish EXIT
# Prepare only the sidecar from immutable candidate assets before touching app.
mkdir -m 700 "$target/ai"
git archive --format=tar "$candidate" docker-compose.local-ai.yml docker-compose.semantic-search.yml scripts/local-ai | tar -xf - -C "$target/ai"
# Preserve the existing Qwen container; this release must never pull or recreate it.
runtime_image=ollama/ollama:0.40.4-rocm@sha256:60cc4504526c70f5f693f5405c129efe7784c9b5c99b22ff41dbf7667a1a637f
docker inspect trbhh-ollama >/dev/null 2>&1 || { echo EXISTING_QWEN_RUNTIME_REQUIRED >&2; exit 1; }
[[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-ai"}}' trbhh-ollama) == 1 ]]
[[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-ollama) == "$project" ]]
[[ $(docker inspect -f '{{.State.Running}}' trbhh-ollama) == true ]]
[[ $(docker inspect -f '{{.Image}}' trbhh-ollama) == $(docker image inspect -f '{{.Id}}' "$runtime_image") ]]
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-ollama) == 4000000000 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-ollama) == 10737418240 ]]
[[ $(docker inspect -f '{{.HostConfig.MemorySwap}}' trbhh-ollama) == 10737418240 ]]
alias_status=0
timeout 10s docker exec -i "$container" timeout 8 node - <<'NODE' || alias_status=$?
(async()=>{
 const r=await fetch('http://ollama:11434/api/tags',{redirect:'error',signal:AbortSignal.timeout(4000)});
 if(!r.ok)throw Error('inventory_http');const j=await r.json();if(!Array.isArray(j.models))throw Error('inventory_invalid');
 process.exitCode=j.models.some(x=>x.name==='trbhh-local:active')?0:2;
})().catch(()=>process.exitCode=1);
NODE
# Inventory is diagnostic only. Visitor embeddings do not depend on Qwen inference.
# An installed alias is not evidence of quality or readiness; do not promote it here.
echo "QWEN=UNVERIFIED — alias inventory exit=$alias_status; supplier search and translation are outside this activation"
# Serialize the read-only model copy against any independently scheduled updater.
exec 8>/run/lock/trbhh-local-ai-update.lock
flock -n 8
exec 7>/run/lock/trbhh-semantic-index.lock
flock -n 7
available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 12*1024*1024 ))
docker_root=$(docker info --format '{{.DockerRootDir}}')
free_kib=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
(( free_kib >= 16*1024*1024 ))
if docker inspect trbhh-embedding >/dev/null 2>&1; then
  [[ $(docker inspect -f '{{index .Config.Labels "trbhh.local-embedding"}}' trbhh-embedding) == 1 ]]
  [[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' trbhh-embedding) == "$project" ]]
fi
runtime_image=ollama/ollama:0.40.4-rocm@sha256:60cc4504526c70f5f693f5405c129efe7784c9b5c99b22ff41dbf7667a1a637f
docker image inspect "$runtime_image" >/dev/null
docker compose --project-directory /root/trbhh --project-name "$project" -f /root/trbhh/docker-compose.yml -f "$target/ai/docker-compose.semantic-search.yml" up -d --no-deps --pull never embedding
[[ $(docker inspect -f '{{.HostConfig.NanoCpus}}' trbhh-embedding) == 2000000000 ]]
[[ $(docker inspect -f '{{.HostConfig.Memory}}' trbhh-embedding) == 2147483648 ]]
[[ $(docker inspect -f '{{.HostConfig.MemorySwap}}' trbhh-embedding) == 2147483648 ]]
# Copy only the verified installed manifest and its bounded SHA256 blob allowlist.
model_dir=/root/.ollama/models
manifest=manifests/registry.ollama.ai/library/embeddinggemma/300m
docker cp "trbhh-ollama:$model_dir/$manifest" "$target/manifest.json"
node - "$target/manifest.json" "$target/blobs.txt" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const bytes=fs.readFileSync(process.argv[2]);assert.ok(bytes.length<=65536);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1');
const m=JSON.parse(bytes),layers=[m.config,...m.layers];assert.ok(layers.length>1&&layers.length<=32);
let size=0;const digests=new Set();for(const layer of layers){assert.match(layer.digest,/^sha256:[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(layer.size)&&layer.size>0);size+=layer.size;digests.add(layer.digest.slice(7));}
assert.ok(size<=800*1024*1024);fs.writeFileSync(process.argv[3],[...digests].join('\n')+'\n',{flag:'wx',mode:0o600});
NODE
docker exec trbhh-embedding mkdir -p "$model_dir/blobs" "$model_dir/manifests/registry.ollama.ai/library/embeddinggemma"
while IFS= read -r digest; do
  [[ $digest =~ ^[a-f0-9]{64}$ ]]
  blob="$model_dir/blobs/sha256-$digest"
  [[ $(docker exec trbhh-ollama sha256sum "$blob" | cut -d' ' -f1) == "$digest" ]]
  docker cp "trbhh-ollama:$blob" - | docker cp - "trbhh-embedding:$model_dir/blobs/"
  [[ $(docker exec trbhh-embedding sha256sum "$blob" | cut -d' ' -f1) == "$digest" ]]
done < "$target/blobs.txt"
docker cp "trbhh-ollama:$model_dir/$manifest" - | docker cp - "trbhh-embedding:$model_dir/manifests/registry.ollama.ai/library/embeddinggemma/"
[[ $(docker exec trbhh-embedding sha256sum "$model_dir/$manifest" | cut -d' ' -f1) == 85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1 ]]
embedding_ready=0
for attempt in $(seq 1 30); do
  if docker exec trbhh-embedding ollama list >/dev/null 2>&1; then embedding_ready=1; break; fi
  sleep 2
done
[[ $embedding_ready == 1 ]]
for asset in semantic-core.cjs public-product-select.cjs build-product-index.cjs; do cp "$target/ai/scripts/local-ai/$asset" "$target/ai/$asset"; done
core_stream(){
  printf 'globalThis.__trbhhSemanticCore=(()=>{const module={exports:{}};\n'
  cat "$target/ai/semantic-core.cjs"
  printf '\nreturn module.exports;})();\n'
}
{
  core_stream
  printf 'globalThis.__trbhhEmbeddingProbe="dedicated";\n'
  cat "$target/local-semantic-benchmark.cjs"
} | docker exec -i "$container" timeout --signal=TERM --kill-after=10s 660s node - | tee "$target/preflight.log"
node - "$target/preflight.log" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const lines=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
const result=lines.find(x=>x.event==='SEMANTIC_PROBE_COMPLETE');assert.ok(result&&result.accepted&&result.correct===40);
NODE
{
  core_stream
  printf 'globalThis.__trbhhPublicProductSelect=(()=>{const module={exports:{}};\n'
  cat "$target/ai/public-product-select.cjs"
  printf '\nreturn module.exports;})();\n'
  cat "$target/ai/build-product-index.cjs"
} | docker exec -i "$container" timeout --signal=TERM --kill-after=10s 29m node - --initial | tee "$target/index.log"
node - "$target/index.log" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const rows=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
assert.ok(rows.some(x=>x.event==='SEMANTIC_INDEX_COMPLETE'&&x.ready===true&&x.count>0));
NODE

echo "BUILDING=$candidate — code only; no new database or media backup."
if ! git archive --format=tar "$candidate" | docker build --build-arg "TRBHH_RELEASE_COMMIT=$candidate" --tag "trbhh-code:$candidate" - > "$target/build.log" 2>&1; then
  echo 'APPLICATION_BUILD_FAILED — last build output follows.'
  tail -n 20 "$target/build.log"
  exit 1
fi
echo APPLICATION_IMAGE_READY
image=$(docker image inspect -f '{{.Id}}' "trbhh-code:$candidate")
[[ $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$candidate" ]]
node "$target/code-only-compose.cjs" "$target/config.json" "$target/before.json" "$image" "$target/candidate.json"
docker compose --project-directory /root/trbhh --project-name "$project" -f "$target/candidate.json" config --format json > "$target/resolved-candidate.json"
node - "$target/before.json" "$target/resolved-candidate.json" "$target/code-only-compose.cjs" <<'NODE'
const fs=require('node:fs'),{runtimeMatches}=require(process.argv[4]);
const before=JSON.parse(fs.readFileSync(process.argv[2]))[0],config=JSON.parse(fs.readFileSync(process.argv[3]));
const valid=runtimeMatches(config,before);
if(!valid){console.error('Compose environment roundtrip failed; values withheld.');process.exit(1);}
NODE
[[ $(sha256sum .env | cut -d' ' -f1) == "$env_hash" ]]
[[ $(git rev-parse HEAD) == "$baseline" ]]
switched=1
git switch --detach "$candidate"
timeout 180s docker compose --project-directory /root/trbhh --project-name "$project" -f "$target/candidate.json" up -d --no-build --pull never --no-deps --force-recreate app
ready=0
for attempt in $(seq 1 60); do
  running=$(timeout 5s docker compose ps -q app 2>/dev/null || true)
  if [[ -n $running ]] && timeout 6s docker exec "$running" timeout 5 node -e 'fetch("http://127.0.0.1:3000/api/version",{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)throw Error("http");return r.json();}).then(j=>process.exit(j.commit===process.argv[1]?0:1)).catch(()=>process.exit(1))' "$candidate"; then ready=1; break; fi
  sleep 2
done
[[ $ready == 1 ]]
[[ $(docker inspect -f '{{.Image}}' "$running") == "$image" ]]
docker inspect "$running" > "$target/after.json"
node "$target/verify-runtime.cjs" "$target/before.json" "$target/after.json"
curl --fail --silent --show-error --max-time 30 "https://trbhh.sa/api/version?release=$candidate" > "$target/version.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).commit!==process.argv[2])process.exit(1)' "$target/version.json" "$candidate"
[[ $(sha256sum .env | cut -d' ' -f1) == "$env_hash" ]]
echo "APPLICATION_RUNTIME_VERIFIED — COMMIT=$candidate"
echo "PUBLIC_VERSION_VERIFIED=$candidate"
{
  core_stream
  cat <<'NODE'
(async()=>{const c=globalThis.__trbhhSemanticCore;await c.verifyModel();const index=await c.readIndex();if(!index.docs.length)throw Error('empty_index');console.log('SEMANTIC_INDEX_POSTCUTOVER_READY');})().catch(()=>process.exitCode=1);
NODE
} | docker exec -i "$running" timeout 15 node -
# Closed store is a valid preserved setting. Never enable it for this check.
docker exec -i "$running" timeout 20 node - <<'NODE' | tee "$target/shop-status.log"
(async()=>{
 const r=await fetch('http://127.0.0.1:3000/shop?q='+encodeURIComponent('أدوات مطبخ'),{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('shop_http');const html=await r.text();
 if(html.includes('data-search-scope="trbhh-products"')){if(!html.includes('data-search-mode="semantic"'))throw Error('shop_semantic_unavailable');console.log('HTTP_STATUS=SEMANTIC');return;}
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
 try{const rows=await db.site_settings.findMany({where:{k:'commerce_enabled'},select:{v:true}});if((rows[0]?.v??'0')==='1')throw Error('store_closed_unconfirmed');console.log('HTTP_STATUS=STORE_CLOSED');}finally{await db.$disconnect();}
})().catch(()=>process.exitCode=1);
NODE
http_status=$(sed -n 's/^HTTP_STATUS=//p' "$target/shop-status.log")
[[ $http_status == SEMANTIC || $http_status == STORE_CLOSED ]]
# Measure only the running candidate. Literal fallback lowers capacity; it is not app failure.
capacity_status=UNVERIFIED
if [[ $http_status == SEMANTIC ]]; then
  if cat "$target/ai/scripts/local-ai/capacity-check.cjs" | docker exec -i "$running" timeout --signal=TERM --kill-after=10s 300s node - "$candidate" --http-only | tee "$target/capacity-http.log"; then
    if node - "$target/capacity-http.log" "$candidate" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const rows=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
const report=rows.find(x=>x.event==='CAPACITY_HTTP_COMPLETE');
assert.ok(report);assert.equal(report.runningCommit,process.argv[3]);
for(const key of ['publicHttpObservedConcurrency','publicHttpIntelligentConcurrency','publicHttpSemanticConcurrency'])assert.ok(Number.isInteger(report[key])&&report[key]>=0&&report[key]<=40);
assert.ok(report.publicHttpSemanticConcurrency<=report.publicHttpIntelligentConcurrency&&report.publicHttpIntelligentConcurrency<=report.publicHttpObservedConcurrency);
console.log('CAPACITY_HTTP_VERIFIED — OBSERVED='+report.publicHttpObservedConcurrency+' INTELLIGENT='+report.publicHttpIntelligentConcurrency+' SEMANTIC='+report.publicHttpSemanticConcurrency+' WORKLOAD=four_warmed_synthetic_phrases; not sustained or cold distinct-query capacity');
for(const key of ['distinctRequests','distinctSemantic','distinctErrors'])assert.ok(Number.isInteger(report[key])&&report[key]>=0&&report[key]<=40);
assert.ok(report.distinctSemantic<=report.distinctRequests&&report.distinctErrors<=report.distinctRequests);
assert.equal(report.distinctCacheState,'unverified');
assert.ok(report.distinctP95Ms===null||Number.isFinite(report.distinctP95Ms)&&report.distinctP95Ms>=0);
console.log('CAPACITY_DISTINCT_MEASURED — REQUESTS='+report.distinctRequests+' SEMANTIC='+report.distinctSemantic+' ERRORS='+report.distinctErrors+' P95_MS='+report.distinctP95Ms+' CACHE=UNVERIFIED RELEVANCE=UNVERIFIED; single bounded burst');
NODE
    then capacity_status=MEASURED; else echo 'CAPACITY_UNVERIFIED — missing or invalid completion report'; fi
  else echo 'CAPACITY_UNVERIFIED — bounded probe stopped; inspect capacity-http.log'; fi
else
  echo 'CAPACITY_UNVERIFIED — STORE_CLOSED; HTTP load skipped without changing settings'
fi
# Failed load probes do not force rollback if exact-version application health passes.
docker exec "$running" timeout 10 node -e 'fetch("http://127.0.0.1:3000/api/version",{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error("health");return r.json()}).then(j=>process.exit(j.commit===process.argv[1]?0:1)).catch(()=>process.exit(1))' "$candidate"
snapshot_timers
search_timer_installed=1
bash "$target/ai/scripts/local-ai/install-search-refresh.sh" "$target/ai"
systemctl is-active --quiet trbhh-semantic-index-refresh.timer
echo "SEMANTIC_SEARCH_CODE_ONLY_VERIFIED — COMMIT=$candidate INDEX_READY=1 HTTP_STATUS=$http_status CAPACITY=$capacity_status QWEN=UNVERIFIED"
