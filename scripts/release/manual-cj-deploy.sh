#!/usr/bin/env bash
# User-run SSH release. Application remains pinned to the CI-verified revision.
set +x +v
set -Eeuo pipefail
umask 077
[[ $# == 1 && $1 =~ ^[0-9a-f]{40}$ && $(id -u) == 0 ]]
tool_revision=$1
candidate=28c4ba63873fc4e9f74e494610b75654b6cfae4f
baseline=21f90045dc3d836bc567fbbefcabbc82fe292397
cd /root/trbhh
[[ $(pwd -P) == /root/trbhh && $(git rev-parse HEAD) == "$baseline" ]]
git diff --cached --quiet
changes=$(git diff --name-only)
[[ -z "$changes" || "$changes" == apps/android-twa/twa-manifest.json ]]
git fetch --no-tags origin '+refs/heads/codex/cj-card-settlements-20261014:refs/remotes/origin/codex/cj-card-settlements-20261014'
[[ $(git rev-parse refs/remotes/origin/codex/cj-card-settlements-20261014) == "$candidate" ]]
git merge-base --is-ancestor "$baseline" "$candidate"
run_id=$(date +%s)
tools="/root/trbhh-release-tools/$run_id"
[[ ! -e "$tools" && ! -L "$tools" ]]
mkdir -p /root/trbhh-release-tools
mkdir -m 700 "$tools"
for file in finance-deploy.sh finance-backup.sh database-proof.cjs media-proof.cjs backup-capacity-proof.cjs supplier-preservation-proof.cjs verify-runtime.cjs finance-capture-job.sh cj-fulfillment-job.sh finance-media-reference.cjs merchant-media-reference.cjs finance-public-verify.cjs manual-release-profile.cjs; do
 git show "$tool_revision:scripts/release/$file" > "$tools/$file"
done
git show "$tool_revision:ops/manual-cj/finance-schema-check.cjs" > "$tools/finance-schema-check.cjs"
node "$tools/manual-release-profile.cjs" "$tools/finance-deploy.sh"
for file in finance-deploy.sh finance-backup.sh finance-capture-job.sh cj-fulfillment-job.sh; do bash -n "$tools/$file"; done
cat > "$tools/launch.sh" <<'SCRIPT'
#!/usr/bin/env bash
set +x +v
set -Eeuo pipefail
umask 077
tools=$(cd "$(dirname "$0")" && pwd -P)
run_id=${tools##*/}
candidate=28c4ba63873fc4e9f74e494610b75654b6cfae4f
backup="/root/trbhh-release-backups/finance-$run_id"
exec >> "$tools/result.log" 2>&1
cd /root/trbhh
env_before=$(sha256sum .env)
recover(){
 result=$?; trap - EXIT
 if (( result != 0 )); then
  echo "DEPLOYMENT FAILED — RUN_ID=$run_id"
  if [[ -f "$backup/VERIFIED" && -f /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]] && [[ $(cat /root/trbhh-release-tools/ACTIVE_DEPLOYMENT) == "$run_id" ]]; then
   bash "$tools/finance-deploy.sh" rollback "$run_id" "$candidate" || echo 'STOP: application rollback requires inspection'
  fi
 fi
 exit "$result"
}
trap recover EXIT
bash "$tools/finance-deploy.sh" deploy "$run_id" "$candidate"
[[ $(sha256sum .env) == "$env_before" ]]
GITHUB_SHA="$candidate" GITHUB_RUN_ID="$run_id" node "$tools/finance-public-verify.cjs"
bash "$tools/finance-deploy.sh" finalize "$run_id" "$candidate"
[[ $(sha256sum .env) == "$env_before" ]]
echo "DEPLOYMENT SUCCESS — COMMIT=$candidate — RUN_ID=$run_id"
SCRIPT
chmod 700 "$tools/launch.sh"
systemd-run --unit="trbhh-cj-deploy-$run_id" --property=Type=exec /bin/bash "$tools/launch.sh"
echo "RUN_ID=$run_id"
echo "RESULT: tail -n 15 $tools/result.log"
echo "STATUS: systemctl status trbhh-cj-deploy-$run_id --no-pager"
