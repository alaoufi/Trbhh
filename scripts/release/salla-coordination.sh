#!/usr/bin/env bash
# Sourced by the coordinator/rollback. Call cancellation only under coordinator.lock.
salla_request_rollback() {
  bash "$tools/salla-rollback.sh" "$id" "$candidate" failure
}
salla_exit_cleanup() {
  local result=$?
  trap - EXIT ERR INT TERM HUP
  if [[ "$armed" == 1 && "$success" != 1 ]]; then
    # Release our launch/finalization lock before the rollback process takes it.
    exec 8>&-
    salla_request_rollback || { echo 'Immediate rollback failed; watchdog remains armed.' >&2; }
    result=1
  fi
  exit "$result"
}
salla_cancel_and_restore() {
  [[ ! -e "$backup/ACTIVATION_ROLLED_BACK" ]] || return 0
  touch "$backup/ACTIVATION_CANCELLED"
  # Blocking stop waits for the entire activation cgroup, not just its shell.
  local load state helper
  load=$(systemctl show "$unit.service" --property=LoadState --value)
  if [[ "$load" != not-found ]]; then
    systemctl stop "$unit.service"
    state=$(systemctl show "$unit.service" --property=ActiveState --value)
    [[ "$state" == inactive || "$state" == failed ]] || return 1
  fi
  # Docker containers are outside the activation cgroup; terminate the named DDL reader too.
  helper=$(docker ps -aq --filter "name=^/$schema_container$")
  if [[ -n "$helper" ]]; then docker rm -f "$schema_container" >/dev/null; fi
  [[ -z "$(docker ps -aq --filter "name=^/$schema_container$")" ]] || return 1
  salla_restore
  touch "$backup/ACTIVATION_ROLLED_BACK"
}
