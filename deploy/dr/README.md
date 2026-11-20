# PostgreSQL recovery components

These files are an opt-in PostgreSQL 17 + pgBackRest image. They do not modify
the application deployment or connect to an existing database. Build and test
with `npm run dr:drill`. See `docs/phase-9-disaster-recovery.md` before adoption.
Use `npm run dr:wal` for a separate bounded automatic-archive + source-crash PITR
drill that does not force WAL switching after its test marker.

Run database containers with `init: true` / `docker run --init`. The scheduler
reaps its sleep child on shutdown. PostgreSQL must not become the orphan reaper
for killed operational processes: an adopted signalled child can trigger its
postmaster crash-recovery path. This is covered by the local scheduler drill.

PostgreSQL needs `wal_level=replica`, `archive_mode=on`,
`archive_command=pgbackrest --stanza=erp archive-push %p`, `archive_timeout=60s`,
`track_commit_timestamp=on`, and `data_checksums` at initialization. Archive
failure must alert; the timeout is a flush interval, not an RPO guarantee.

The local drill uses a separately mounted encrypted repository volume, read-only
on restore hosts. This proves recovery, **not off-host disaster resilience**.
For staging/production use a separate backup account/host and an encrypted,
versioned repository with independent retention protection. Application
credentials must have no access. Do not mount the local drill repository into
the application. Use dedicated backup and restore operators; restore credentials
must not have repository write/delete rights. Do not deploy the drill secrets.

`dr-configure` reads a private secret file and writes a mode-0600 temporary
configuration. Keep the original key in an independently accessible secret
manager and escrow. Rotating a key requires a new repository and retained old
keys until all old recovery chains expire. Removing the old key makes those
backups unrecoverable. Never reuse application JWT or database credentials.

`dr-backup-loop` is the backup scheduler, run as postgres with access to this
cluster's PGDATA/socket, repository, and secret. Its first failure exits nonzero.
Supervise and alert on exit, missing daily backup, archive failures, oldest
unarchived WAL, and repository capacity. Bound execution externally to 30 minutes
and alert before restarting. A watchdog independent of this host must verify
archive lag < 15 minutes and periodically perform a separate-host restore.
Retain seven full chains and all WAL needed by those chains; object versions
must cover the same recovery window plus the maximum restore duration.

For a Linux host with an approved `erp-postgres-dr` container, the supplied
`axon-backup.service.example` + `axon-backup.timer.example` provide an alternative
to the long-running scheduler. Review the explicit target, stanza initialization,
secret mounts, independent failure receiver and journal retention first. Install
under `/etc/systemd/system` only after staging approval; then enable the timer.
Do not run both schedulers. The timer is a deployment template, not something the
local Windows drill enables or validates. Continuous WAL archiving remains a
separate PostgreSQL responsibility.

## Optional Phase 10 telemetry

The Phase 10 image additionally contains `jq` and `dr-metrics`. Build it with
`npm run observability:build`; the Phase 9 image tag remains separate. Do not
replace an adopted database image without the normal staging restore and release
approval. These scripts do not provision or alter an existing deployment.

Create a dedicated telemetry directory/volume owned by postgres, readable by the
application runtime, with no repository, database configuration or cipher files.
Mount it read/write into the database container at `/var/run/axon-dr`, and
**read only** into API/worker containers at `/run/axon-dr`. Set
`DR_METRICS_FILE=/run/axon-dr/metrics.prom` on API/worker. The endpoint accepts
only that exact path, a regular file of at most 16 KiB, and allowlisted numeric
signals. The file contains no credentials or tenant identifiers. POSIX modes in
the examples do not establish Windows NTFS access controls.

Run `dr-backup-loop` with `DR_METRICS_DIRECTORY=/var/run/axon-dr` to atomically
record the actual backup attempt outcome. For a daily oneshot scheduler, review
`axon-backup-observed.service.example`, pair it with the existing daily timer
(change the timer's Unit to this service), and use `DR_BACKUP_ONCE=true`.
Choose one scheduler; never start both. A missing completion file means unknown,
not successful. A killed host cannot reliably write a failure file, so missing
backup age and the independent receiver remain necessary controls.

Review `axon-dr-metrics.service.example` and its 30-second timer. The collector
runs locally as postgres, reads pgBackRest info and `pg_stat_archiver`, uses
read-only SQL and bounded command deadlines, then atomically publishes the file.
It never backs up, expires, restores or switches WAL. Configure the correct
database name and approved container explicitly. Keep the collector independent
of backup execution, so a failed backup cannot suppress its own alarm.

Prometheus scrapes the authenticated API/worker endpoint; no application database
password or repository access is given to monitoring. Unknown probe state,
stale probe timestamp, backup age/failure and archive delay/failure have separate
alerts. WAL freshness uses the existing 900-second threshold. Synchronize hosts
with an approved time service; this probe reports database clock skew but cannot
repair NTP. Scrape intervals, probe caching and alert `for` periods add detection
latency; the archive timeout alone does not guarantee RPO.

Before enabling the examples, configure and test a real independent failure
receiver, its escalation policy and resolution delivery. The isolated Phase 10
receiver is a local test sink. Review private metrics token delivery, network
isolation, directory ownership, off-host repository IAM and a separate-host
restore. Never copy synthetic drill credentials or targets into production.

Rollback disables the telemetry timer and unsets `DR_METRICS_FILE`; it does not
change backup chains, archive settings, application records or audit history.
Restore the prior approved backup scheduler only after checking that exactly one
scheduler is active. Seven full chains are not a legal retention determination
or a promise of exactly seven calendar days. Retention and erasure obligations,
including what must be reapplied after a restore, require the data owner's and
legal team's documented approval.
