#!/bin/sh
set -eu
# Run as postgres. flock + pgBackRest's repository lock also protect manual overlap.
# A failure terminates this process; the supervisor must alert on its exit.
active_pid=
backup_active=1
write_attempt_state() {
  # Optional diagnostic output. Failure leaves a stale/missing feed alarm; it
  # must not interrupt a successful backup or create a fictitious success.
  if [ -n "${DR_METRICS_DIRECTORY:-}" ]; then
    (umask 077; state=$(mktemp "$DR_METRICS_DIRECTORY/attempt.XXXXXX"); trap 'rm -f -- "$state"' EXIT; printf 'axon_dr_backup_attempt_failed %s\naxon_dr_backup_attempt_timestamp_seconds %s\n' "$1" "$(date -u +%s)" > "$state"; chmod 644 "$state"; mv -f -- "$state" "$DR_METRICS_DIRECTORY/backup-attempt.prom") || printf '{"event":"backup_metrics_write_failed"}\n' >&2
  fi
}
stop_child() {
  if [ -n "$active_pid" ]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
    active_pid=
  fi
}
stop() {
  trap '' TERM INT
  if [ "$backup_active" = 1 ]; then write_attempt_state 1; fi
  stop_child
  printf '{"event":"backup_scheduler_stopped"}\n'
  exit 0
}
trap stop TERM INT
trap 'status=$?; stop_child; if [ "$status" -ne 0 ]; then write_attempt_state 1; printf "{\"event\":\"backup_scheduler_failed\",\"exitCode\":%s}\n" "$status" >&2; fi' EXIT
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
  backup_active=1
  run_bounded pgbackrest --stanza=erp check
  # Daily full is deliberately simple; seven full recovery chains are retained.
  flock -n 9
  run_bounded pgbackrest --stanza=erp --type=full backup
  flock -u 9
  run_bounded pgbackrest --stanza=erp expire
  write_attempt_state 0
  backup_active=0
  printf '{"event":"backup_completed","at":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [ "${DR_BACKUP_ONCE:-false}" = true ]; then break; fi
  sleep 86400 & active_pid=$!
  wait "$active_pid"
  active_pid=
done
