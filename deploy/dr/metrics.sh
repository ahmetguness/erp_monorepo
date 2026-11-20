#!/bin/sh
set -eu
umask 077
# Run locally as postgres under an independent timer. Read-only repository/SQL
# probes; never run backup, expire, restore, pg_switch_wal or business writes.
directory=${DR_METRICS_DIRECTORY:?Explicit private metrics directory required}
test -d "$directory"
result=$(mktemp "$directory/metrics.XXXXXX")
metadata=$(mktemp "$directory/backup-info.XXXXXX")
archive=$(mktemp "$directory/archive-info.XXXXXX")
trap 'rm -f -- "$result" "$metadata" "$archive"' EXIT
up=1
emit() { printf '# TYPE %s %s\n%s %s\n' "$1" "$3" "$1" "$2" >> "$result"; }
emit axon_dr_probe_timestamp_seconds "$(date -u +%s)" gauge
if timeout --kill-after=1s 5 pgbackrest --stanza=erp --output=json info > "$metadata" 2>/dev/null && jq -e 'length == 1 and .[0].name == "erp" and .[0].status.code == 0 and (.[0].backup | type == "array")' "$metadata" >/dev/null; then
  emit axon_dr_repository_up 1 gauge
  last=$(jq -er '[.[0].backup[] | select(.label | test("^[0-9]{8}-[0-9]{6}F$")) | .timestamp.stop | select(type == "number" and . >= 0)] | max // empty' "$metadata") || last=
  if [ -n "$last" ]; then emit axon_dr_backup_last_success_seconds "$last" gauge; else up=0; fi
else emit axon_dr_repository_up 0 gauge; up=0; fi
if PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=100' PGCONNECT_TIMEOUT=3 timeout --kill-after=1s 5 psql -XAt -v ON_ERROR_STOP=1 -c "SELECT json_build_object('age',extract(epoch FROM clock_timestamp()-last_archived_time),'failed',coalesce(last_failed_time>last_archived_time,last_failed_time IS NOT NULL),'failures',failed_count,'archived',archived_count) FROM pg_stat_archiver" > "$archive" 2>/dev/null && jq -e '(.age | type == "number" and . >= 0) and (.failed | type == "boolean") and (.failures | type == "number" and . >= 0) and (.archived | type == "number" and . >= 1)' "$archive" >/dev/null; then
  emit axon_dr_wal_age_seconds "$(jq -r '.age' "$archive")" gauge
  emit axon_dr_archive_failure "$(jq -r 'if .failed then 1 else 0 end' "$archive")" gauge
  emit axon_dr_archive_failures_total "$(jq -r '.failures' "$archive")" counter
  emit axon_dr_archived_total "$(jq -r '.archived' "$archive")" counter
else up=0; fi
state="$directory/backup-attempt.prom"
if [ -f "$state" ] && [ "$(wc -c < "$state")" -le 1024 ]; then
  failed=$(sed -n 's/^axon_dr_backup_attempt_failed \([01]\)$/\1/p' "$state")
  case "$failed" in 0|1) emit axon_dr_backup_failure "$failed" gauge;; *) up=0;; esac
else up=0; fi
emit axon_dr_probe_up "$up" gauge
# Group-readable dedicated telemetry directory; no credentials are emitted.
chmod 644 "$result"
mv -f -- "$result" "$directory/metrics.prom"
