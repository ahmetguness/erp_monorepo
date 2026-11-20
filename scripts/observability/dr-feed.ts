import { repositoryHealth, archiveHealth } from "../disaster-recovery/health.js";
import type { RecoveryOperations } from "../disaster-recovery/operations.js";
import { rename, writeFile } from "node:fs/promises";
export function repositoryHealthMetrics(health: Awaited<ReturnType<typeof repositoryHealth>>, at = Date.now()): string {
  const lastSuccess = health.backupAgeSeconds === null
    ? undefined
    : at / 1000 - health.backupAgeSeconds;
  const values = {
    axon_dr_probe_up: 1,
    axon_dr_repository_up: 1,
    axon_dr_backup_failure: health.backupAgeSeconds === null ? 1 : 0,
    ...(lastSuccess === undefined
      ? {}
      : { axon_dr_backup_last_success_seconds: lastSuccess }),
    axon_dr_wal_age_seconds: health.archiveAgeSeconds,
    axon_dr_archive_failure: health.unrecoveredArchiveFailure ? 1 : 0,
    axon_dr_archive_failures_total: health.failedCount,
    axon_dr_archived_total: health.archivedCount,
    axon_dr_probe_timestamp_seconds: at / 1000,
  };
  return (Object.entries(values)
    .map(([name, value]) => `# TYPE ${name} ${name.endsWith("_total") ? "counter" : "gauge"}\n${name} ${value}`)
    .join("\n") + "\n");
}
/** Local drill bridge for the real Phase9 repository probe; never invents healthy state. */
export function startRepositoryHealthFeed(operations: RecoveryOperations, file: string, backupFailure: () => boolean = () => false): () => Promise<{
  probeFailures: number;
  writeFailures: number;
}> {
  let pending: Promise<void> | undefined;
  let probeFailures = 0, writeFailures = 0;
  const update = () => {
    if (pending)
      return;
    pending = (async () => {
      const [repository, archive] = await Promise.allSettled([operations.info(), archiveHealth(operations)]);
      const up = repository.status === 'fulfilled' && archive.status === 'fulfilled';
      if (!up)
        probeFailures++;
      const values: Record<string, number> = {
        axon_dr_probe_up: up ? 1 : 0,
        axon_dr_repository_up: repository.status === 'fulfilled' ? 1 : 0,
        axon_dr_backup_failure: backupFailure() || (repository.status === 'fulfilled' && !repository.value.length) ? 1 : 0,
        axon_dr_probe_timestamp_seconds: Date.now() / 1000,
      };
      if (repository.status === 'fulfilled') {
        const latest = repository.value.at(-1);
        if (latest)
          values.axon_dr_backup_last_success_seconds = latest.stop;
      }
      if (archive.status === 'fulfilled')
        Object.assign(values, {
          axon_dr_wal_age_seconds: archive.value.archiveAgeSeconds,
          axon_dr_archive_failure: archive.value.unrecoveredArchiveFailure ? 1 : 0,
          axon_dr_archive_failures_total: archive.value.failedCount,
          axon_dr_archived_total: archive.value.archivedCount,
        });
      const text = Object.entries(values).map(([name, value]) => `# TYPE ${name} ${name.endsWith('_total') ? 'counter' : 'gauge'}\n${name} ${value}`).join('\n') + '\n';
      try {
        await writeFile(file + ".tmp", text, { mode: 0o644 });
        await rename(file + ".tmp", file);
      }
      catch {
        writeFailures++;
      } // Unchanged timestamp becomes an explicit stale-feed alarm.
    })().finally(() => {
      pending = undefined;
    });
  };
  const timer = setInterval(update, 10000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    // A paused Docker/DB transport can outlive its own command deadline. Never
    // block cleanup indefinitely; a still-pending single probe is a failure.
    if (pending) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([pending, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('DR probe still in flight during shutdown')), 5000); })]);
      }
      finally {
        if (deadline)
          clearTimeout(deadline);
      }
    }
    return { probeFailures, writeFailures };
  };
}
