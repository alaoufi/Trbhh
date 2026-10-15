#!/usr/bin/env bash
# Stream immutable protocol and updater together: works before application cutover.
set -Eeuo pipefail
assets_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
[[ ${1:-} == '' || ${1:-} == --verify ]] || exit 1
{
 printf 'globalThis.__trbhhLocalProtocol=(()=>{const module={exports:{}};\n'
 cat "$assets_dir/protocol.cjs"
 printf '\nreturn module.exports;})();\n'
 cat "$assets_dir/update-model.cjs"
} | docker exec -i trbhh-app node - "${1:-}"
