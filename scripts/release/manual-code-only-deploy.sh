#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
candidate=35ac47b1c0b8768a65a14ca8388e2f4febc53c99
baseline=682aa7c5cd19a47bc5758726e2d9abd8c1a84663
branch=codex/admin-navigation-complete-20261014
[[ $(id -u) == 0 ]]
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh ]]
if [[ ${1:-} != --run ]]; then
  [[ ${1:-} =~ ^[a-f0-9]{40}$ ]]
  revision=$1
  reference=${2:-}
  [[ -z $reference || $reference =~ ^/root/trbhh-release-tools/code-only-[0-9]+/before.json$ ]]
  run_id=$(date +%s)
  target=/root/trbhh-release-tools/code-only-$run_id
  [[ ! -e $target ]]
  mkdir -m 700 "$target"
  for file in manual-code-only-deploy.sh code-only-compose.cjs verify-runtime.cjs; do
    git show "$revision:scripts/release/$file" > "$target/$file"
  done
  bash -n "$target/manual-code-only-deploy.sh"
  touch "$target/result.log"
  systemd-run --unit="trbhh-code-deploy-$run_id" --property=Type=exec /bin/bash "$target/manual-code-only-deploy.sh" --run "$target" "$reference"
  printf 'RUN_ID=%s\nRESULT: tail -n 30 %s/result.log\n' "$run_id" "$target"
  exit 0
fi
target=${2:?}
[[ $target =~ ^/root/trbhh-release-tools/code-only-[0-9]+$ && -d $target && ! -L $target ]]
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
finish(){
  result=$?
  trap - EXIT
  if [[ $result != 0 && $switched == 1 ]]; then
    echo 'Deployment failed; restoring the previous application image only.'
    if timeout 180s docker compose --project-directory /root/trbhh --project-name "$project" -f "$target/rollback.json" up -d --no-build --pull never --no-deps --force-recreate app && git switch --detach "$baseline"; then
      echo 'Previous application image restored; database and media were not restored or replaced.'
    else
      echo 'ROLLBACK FAILED — operator action required.'
    fi
  fi
  exit "$result"
}
trap finish EXIT
echo "BUILDING=$candidate — code only; no new database or media backup."
git archive --format=tar "$candidate" | docker build --build-arg "TRBHH_RELEASE_COMMIT=$candidate" --tag "trbhh-code:$candidate" -
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
  running=$(docker compose ps -q app)
  if [[ -n $running ]] && docker exec "$running" node -e 'fetch("http://127.0.0.1:3000/api/version").then(r=>r.json()).then(j=>process.exit(j.commit===process.argv[1]?0:1)).catch(()=>process.exit(1))' "$candidate"; then ready=1; break; fi
  sleep 2
done
[[ $ready == 1 ]]
[[ $(docker inspect -f '{{.Image}}' "$running") == "$image" ]]
docker inspect "$running" > "$target/after.json"
node "$target/verify-runtime.cjs" "$target/before.json" "$target/after.json"
curl --fail --silent --show-error --max-time 30 "https://trbhh.sa/api/version?release=$candidate" > "$target/version.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).commit!==process.argv[2])process.exit(1)' "$target/version.json" "$candidate"
[[ $(sha256sum .env | cut -d' ' -f1) == "$env_hash" ]]
echo "DEPLOYMENT SUCCESS — COMMIT=$candidate"
