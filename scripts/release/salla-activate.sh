#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
id=${1:?verified backup id}; candidate=${2:?exact candidate sha}
[[ "$id" =~ ^[0-9]+$ && "$candidate" =~ ^[0-9a-f]{40}$ ]] || exit 1
tools=$(cd "$(dirname "$0")" && pwd -P)
backup="/root/trbhh-release-backups/audit-$id"
baseline=eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96
[[ ! -L /root/trbhh && ! -L /root/trbhh-release-backups && ! -L "$backup" && "$(realpath "$backup")" == "$backup" ]] || exit 1
[[ "$(cat "$backup/VERIFIED")" == "$baseline" && "$(cat "$backup/candidate.txt")" == "$candidate" && -f "$backup/salla-staged.env" && ! -L "$backup/salla-staged.env" ]] || exit 1
[[ $(( $(date +%s) - $(stat -c %Y "$backup/VERIFIED") )) -lt 3600 ]] || { echo 'Fresh backup required'; exit 1; }
[[ ! -e "$backup/ACTIVATION_STARTED" ]] || { echo 'Activation already attempted; operator review required'; exit 1; }
cd /root/trbhh
[[ "$(git rev-parse HEAD)" == "$baseline" ]] || exit 1
cmp --silent .env "$backup/environment.env"
cmp --silent docker-compose.yml "$backup/docker-compose.yml"
git diff --cached --quiet
changes=$(git diff --name-only)
[[ -z "$changes" || "$changes" == apps/android-twa/twa-manifest.json ]] || exit 1
git fetch origin codex/salla-release-20260920
[[ "$(git rev-parse FETCH_HEAD)" == "$candidate" ]] || exit 1
git merge-base --is-ancestor "$baseline" "$candidate"
git diff --quiet "$baseline" "$candidate" -- src/app/page.tsx src/lib/home-feed.ts tests/unit/home-feed.test.ts
build_base=/root/trbhh-release-candidates
[[ ! -L "$build_base" ]] || exit 1
mkdir -p "$build_base"; chmod 700 "$build_base"
context=$(mktemp -d "$build_base/$candidate.XXXXXXXX")
git archive "$candidate" | tar -xf - -C "$context" --no-same-owner
node "$tools/salla-environment.cjs" verify "$backup/environment.env" "$backup/salla-staged.env" "$backup/docker-compose.yml" "$context/docker-compose.yml"
image="trbhh-salla:$candidate"
docker build --label "trbhh.release-sha=$candidate" -t "$image" "$context" > "$backup/candidate-build.log" 2>&1
container=$(docker compose ps -q app)
[[ -n "$container" && "$(docker inspect -f '{{.Image}}' "$container")" == "$(cat "$backup/image-id.txt")" && "$(docker inspect -f '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]] || exit 1
network=$(cat "$backup/network.txt")
[[ "$network" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 1
timer="trbhh-salla-rollback-$id"
unit="trbhh-salla-activation-$id"
source "$tools/salla-coordination.sh"
armed=0
success=0
trap salla_exit_cleanup EXIT
trap 'exit 1' INT TERM HUP
# Serialize launch with watchdog/manual rollback; never hold this lock while waiting for DDL.
exec 8> "$backup/coordinator.lock"
flock -x 8
[[ ! -e "$backup/ACTIVATION_STARTED" && ! -e "$backup/ACTIVATION_CANCELLED" ]] || exit 1
printf '%s\n' "$candidate" > "$backup/ACTIVATION_STARTED"
armed=1
systemd-run --unit="$timer" --on-active=15m /bin/bash "$tools/salla-rollback.sh" "$id" "$candidate" watchdog >/dev/null
systemd-run --unit="$unit" --property=Type=exec --property=RemainAfterExit=yes --property=RuntimeMaxSec=14min --property=TimeoutStopSec=15s --property=KillMode=control-group --property=SendSIGKILL=yes --property="StandardOutput=append:$backup/activation.log" --property="StandardError=append:$backup/activation.log" /bin/bash "$tools/salla-cutover.sh" "$id" "$candidate" >/dev/null
flock -u 8
exec 8>&-
finished=0
for attempt in $(seq 1 450); do
 [[ ! -e "$backup/ACTIVATION_CANCELLED" ]] || exit 1
 state=$(systemctl show "$unit.service" --property=SubState --value)
 if [[ "$state" == exited ]]; then finished=1; break; fi
 [[ "$state" != failed && "$state" != dead ]] || exit 1
 sleep 2
done
[[ "$finished" == 1 ]] || exit 1
exec 8> "$backup/coordinator.lock"
flock -x 8
[[ ! -e "$backup/ACTIVATION_CANCELLED" && -e "$backup/ACTIVATION_CHILD_VERIFIED" ]] || exit 1
[[ "$(systemctl show "$unit.service" --property=Result --value)" == success ]] || exit 1
# A watchdog already queued will acquire this same lock and observe success. Never stop its service.
systemctl stop "$timer.timer"
touch "$backup/ACTIVATION_SUCCEEDED"
success=1
flock -u 8
exec 8>&-
echo 'Salla code/config verified. Live supplier order creation remains blocked; merchant consent still required.'
