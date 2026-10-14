#!/usr/bin/env bash
set +x +v
set -Eeuo pipefail
umask 077
trap 'printf "%s\n" "CJ private activation rejected; details withheld." >&2' ERR
[[ $# == 3 && "$1" =~ ^(inspect|enable|restore|prepare-permissions)$ && "$2" =~ ^[1-9][0-9]{0,19}$ && "$3" =~ ^[a-f0-9]{40}$ ]]
[[ $(id -u) == 0 && $(realpath /root/trbhh) == /root/trbhh ]]
for executable in node docker flock; do command -v "$executable" >/dev/null; done
exec 9>/run/lock/trbhh-finance-deploy.lock
flock -w 600 9
exec 8>/run/lock/trbhh-cj-fulfillment.lock
flock -w 130 8
[[ ! -e /root/trbhh-release-tools/ACTIVE_DEPLOYMENT ]]
cd /root/trbhh
node "$(dirname "$(realpath "$0")")/cj-private-activation-host.cjs" "$1" "$2" "$3"
