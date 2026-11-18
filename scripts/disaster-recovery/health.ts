import { RecoveryOperations } from "./operations.js";

export async function repositoryHealth(operations: RecoveryOperations) {
  const cluster = operations.cluster;
  const backups = await operations.info();
  const latest = backups.at(-1);
  const archived = await cluster.sql(
    cluster.source,
    `SELECT json_build_object(
    'ageSeconds', extract(epoch FROM (clock_timestamp()-last_archived_time)),
    'unrecoveredArchiveFailure', coalesce(last_failed_time>last_archived_time, last_failed_time IS NOT NULL),
    'failedCount', failed_count, 'archivedCount', archived_count
  ) FROM pg_stat_archiver`,
  );
  const input: unknown = JSON.parse(archived);
  if (
    !input ||
    typeof input !== "object" ||
    !("ageSeconds" in input) ||
    !("unrecoveredArchiveFailure" in input) ||
    !("failedCount" in input) ||
    !("archivedCount" in input)
  )
    throw new Error("Invalid archiver metrics.");
  const { ageSeconds, unrecoveredArchiveFailure, failedCount, archivedCount } =
    input;
  if (
    typeof ageSeconds !== "number" ||
    !Number.isFinite(ageSeconds) ||
    typeof unrecoveredArchiveFailure !== "boolean" ||
    typeof failedCount !== "number" ||
    typeof archivedCount !== "number" ||
    !Number.isSafeInteger(failedCount) ||
    !Number.isSafeInteger(archivedCount) ||
    failedCount < 0 ||
    archivedCount < 1
  )
    throw new Error("Archiver has no valid recovery evidence.");
  const backupAgeSeconds = latest ? Date.now() / 1000 - latest.stop : null;
  return {
    passed:
      backupAgeSeconds !== null &&
      backupAgeSeconds >= 0 &&
      backupAgeSeconds <= 26 * 3600 &&
      ageSeconds >= 0 &&
      ageSeconds <= 900 &&
      !unrecoveredArchiveFailure,
    backupAgeSeconds,
    archiveAgeSeconds: ageSeconds,
    unrecoveredArchiveFailure,
    failedCount,
    archivedCount,
  };
}
