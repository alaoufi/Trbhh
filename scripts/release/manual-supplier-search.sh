#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 2 ]]
revision=$1
candidate=$2
[[ $revision =~ ^[a-f0-9]{40}$ && $candidate =~ ^[a-f0-9]{40}$ ]]
cd /root/trbhh
release_root=/root/trbhh-release-tools
[[ -d $release_root && ! -L $release_root ]]
target=$(mktemp -d "$release_root/supplier-search.XXXXXX")
for file in manual-arabic-app-deploy.sh manual-local-role.sh; do
  git show "$revision:scripts/release/$file" > "$target/$file"
  bash -n "$target/$file"
done
# BEGIN VERIFIED SEARCH FLOW
if ! output=$(bash "$target/manual-arabic-app-deploy.sh" "$revision" "$candidate"); then
  printf '%s\n' "$output"
  exit 1
fi
printf '%s\n' "$output"
run_id=$(printf '%s\n' "$output" | sed -n 's/^RUN_ID=//p')
if [[ ! $run_id =~ ^[0-9]+$ ]]; then exit 1; fi
unit="trbhh-code-deploy-$run_id.service"
deadline=$((SECONDS+1800))
while systemctl is-active --quiet "$unit"; do
  if (( SECONDS >= deadline )); then echo 'DEPLOYMENT_STILL_RUNNING — no activation attempted.'; exit 1; fi
  sleep 5
done
log="$release_root/arabic-app-$run_id/result.log"
tail -n 16 "$log"
if [[ $(systemctl show -p Result --value "$unit") != success || $(systemctl show -p ExecMainStatus --value "$unit") != 0 ]] || ! grep -Fq "APPLICATION_CODE_ONLY_VERIFIED — COMMIT=$candidate " "$log"; then
  echo 'DEPLOYMENT_NOT_VERIFIED — no activation attempted.' >&2
  exit 1
fi
if ! bash "$target/manual-local-role.sh" "$revision" "$candidate" search --activate; then
  echo 'SUPPLIER_SEARCH_NOT_ACTIVATED — translation remains unchanged.' >&2
  exit 1
fi
echo "SUPPLIER_SEARCH_ACTIVATED COMMIT=$candidate TRANSLATION_UNCHANGED=1 STORE_FLAGS_UNCHANGED=1"
