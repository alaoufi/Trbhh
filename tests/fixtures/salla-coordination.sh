#!/usr/bin/env bash
# Real shell exits/process cancellation; systemctl and Docker are mocked, never contacted.
set -euo pipefail
scenario=${1:?scenario}
fixture_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
fixture=$(mktemp -d "$fixture_root/trbhh-salla-fixture.XXXXXXXX")
fixture_owner=$BASHPID
cleanup_fixture() {
  local result=$? child
  # Background Bash contexts can inherit EXIT. Only the creating shell owns this directory.
  [[ "$BASHPID" == "$fixture_owner" ]] || return "$result"
  trap - EXIT
  for child in $(jobs -pr); do kill "$child" 2>/dev/null || true; done
  wait 2>/dev/null || true
  [[ "$fixture" == "$fixture_root"/trbhh-salla-fixture.* ]] || return 1
  rm -rf -- "$fixture"
  return "$result"
}
trap cleanup_fixture EXIT
backup=$fixture
tools=$fixture
id=1
candidate=fixture
unit=fixture-activation
timer=fixture-watchdog
schema_container=fixture-schema
success=0
armed=1
helper=scripts/release/salla-coordination.sh
if [[ ! -f "$helper" ]]; then echo 'Missing EXIT/cancellation coordinator'; exit 1; fi
source "$helper"
systemctl() {
  if [[ "$1" == stop && "$2" == "$unit.service" ]]; then
    echo stop >> "$fixture/events"
    if [[ "$scenario" == stop-failure ]]; then return 1; fi
    if [[ -n "${worker:-}" ]]; then kill "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; fi
  elif [[ "$1" == show ]]; then
    if [[ "$3" == --property=LoadState ]]; then printf 'loaded\n'; else printf 'inactive\n'; fi
  fi
}
docker() {
  if [[ "$1" == ps ]]; then
    if [[ ! -f "$fixture/container-removed" ]]; then echo fixture-container; fi
  else echo docker-stop >> "$fixture/events"; touch "$fixture/container-removed"; fi
}
salla_restore() { echo restore >> "$fixture/events"; }
case "$scenario" in
  child-exit-cleanup)
    # Force the inherited EXIT-handler path independently of OS signal timing.
    (trap cleanup_fixture EXIT; exit 0)
    [[ -d "$fixture" ]]
    ;;
  explicit-exit|command-failure|success)
    # Exercise the production EXIT handler in a separate shell context.
    salla_request_rollback() { echo rollback >> "$fixture/events"; }
    set +e
    (
      set -Eeuo pipefail
      trap salla_exit_cleanup EXIT
      if [[ "$scenario" == success ]]; then success=1; exit 0; fi
      if [[ "$scenario" == explicit-exit ]]; then [[ 1 == 2 ]] || exit 7; fi
      false
    ) 2>/dev/null
    result=$?
    set -e
    if [[ "$scenario" == success ]]; then [[ "$result" == 0 && ! -e "$fixture/events" ]];
    else [[ "$result" != 0 && "$(cat "$fixture/events")" == rollback ]]; fi
    ;;
  cancel-delayed-worker|duplicate-rollback)
    (trap - EXIT; sleep 1; echo candidate-reapplied >> "$fixture/events") & worker=$!
    salla_cancel_and_restore
    if [[ "$scenario" == duplicate-rollback ]]; then salla_cancel_and_restore; fi
    sleep 1.2
    [[ "$(cat "$fixture/events")" == $'stop\ndocker-stop\nrestore' ]]
    [[ -f "$backup/ACTIVATION_CANCELLED" && -f "$backup/ACTIVATION_ROLLED_BACK" ]]
    ;;
  stop-failure)
    set +e
    (set -e; salla_cancel_and_restore)
    result=$?
    set -e
    [[ "$result" != 0 && "$(cat "$fixture/events")" == stop && ! -e "$backup/ACTIVATION_ROLLED_BACK" ]]
    ;;
  concurrent-rollback)
    command -v flock >/dev/null
    salla_restore() { sleep 0.1; echo restore >> "$fixture/events"; }
    (exec 9> "$backup/coordinator.lock"; flock -x 9; salla_cancel_and_restore) & first=$!
    (exec 9> "$backup/coordinator.lock"; flock -x 9; salla_cancel_and_restore) & second=$!
    wait "$first"; wait "$second"
    [[ "$(cat "$fixture/events")" == $'stop\ndocker-stop\nrestore' ]]
    ;;
esac
