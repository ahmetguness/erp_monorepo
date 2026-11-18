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
