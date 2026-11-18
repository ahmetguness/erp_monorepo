#!/bin/sh
set -eu
# Run as postgres. flock + pgBackRest's repository lock also protect manual overlap.
# A failure terminates this process; the supervisor must alert on its exit.
active_pid=
stop_child() {
  if [ -n "$active_pid" ]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
    active_pid=
  fi
}
stop() {
  trap '' TERM INT
  stop_child
  printf '{"event":"backup_scheduler_stopped"}\n'
  exit 0
}
trap stop TERM INT
trap 'status=$?; stop_child; if [ "$status" -ne 0 ]; then printf "{\"event\":\"backup_scheduler_failed\",\"exitCode\":%s}\n" "$status" >&2; fi' EXIT
run_bounded() {
  timeout --kill-after=10s 1800 "$@" & active_pid=$!
  result=0
  wait "$active_pid" || result=$?
  active_pid=
  return "$result"
}
exec 9>/tmp/dr-backup.lock
run_bounded pgbackrest --stanza=erp stanza-create
while :; do
  run_bounded pgbackrest --stanza=erp check
  # Daily full is deliberately simple; seven full recovery chains are retained.
  flock -n 9
  run_bounded pgbackrest --stanza=erp --type=full backup
  flock -u 9
  run_bounded pgbackrest --stanza=erp expire
  printf '{"event":"backup_completed","at":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sleep 86400 & active_pid=$!
  wait "$active_pid"
  active_pid=
done
