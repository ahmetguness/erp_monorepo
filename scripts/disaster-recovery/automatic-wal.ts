import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { DrillCluster } from "./cluster.js";
import { RecoveryOperations } from "./operations.js";
import { docker } from "./process.js";
import { finalizeDrill, captureSourceDiagnostics } from "./finalization.js";

// An independent RPO drill: after the initial base backup, neither check nor
// pg_switch_wal is called. PostgreSQL's configured archive_timeout ships WAL.
export async function automaticWalDrill(): Promise<void> {
  const cluster = DrillCluster.fresh();
  const operations = new RecoveryOperations(cluster);
  console.log(`Automatic WAL drill owner: ${cluster.id}`);
  let passed = false;
  try {
    await cluster.create();
    await cluster.sql(
      cluster.source,
      "CREATE TABLE dr_wal_markers (id text PRIMARY KEY)",
    );
    const backup = await operations.backup();
    await cluster.sql(
      cluster.source,
      "INSERT INTO dr_wal_markers VALUES ('KEEP')",
    );
    const committedAt = await cluster.sql(
      cluster.source,
      "SELECT to_char(pg_xact_commit_timestamp(xmin) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM dr_wal_markers WHERE id='KEEP'",
    );
    const time = await cluster.sql(
      cluster.source,
      "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
    );
    await pause(1000);
    await cluster.sql(
      cluster.source,
      "INSERT INTO dr_wal_markers VALUES ('EXCLUDE')",
    );
    const segment = await cluster.sql(
      cluster.source,
      "SELECT pg_walfile_name(pg_current_wal_lsn())",
    );
    if (!/^[A-F0-9]{24}$/.test(segment))
      throw new Error("Invalid source WAL identity.");
    const started = performance.now();
    let archived = false;
    while (performance.now() - started < 120_000) {
      const last = await cluster.sql(
        cluster.source,
        "SELECT last_archived_wal FROM pg_stat_archiver",
      );
      if (/^[A-F0-9]{24}$/.test(last) && last >= segment) {
        archived = true;
        break;
      }
      await pause(1000);
    }
    if (!archived)
      throw new Error(
        "Automatic WAL archival did not meet the bounded drill deadline.",
      );
    const archiveObservedAfterSeconds = (performance.now() - started) / 1000;
    const incidentAt = await cluster.sql(
      cluster.source,
      "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
    );
    await cluster.assertOwned("container", cluster.source);
    await docker(["kill", "--signal=KILL", cluster.source]);
    const restoreStarted = performance.now();
    const target = await operations.newTarget("automaticwal");
    await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
      backup: backup.label,
      time,
    });
    if (
      (await cluster.sql(
        target,
        "SELECT count(*) FROM dr_wal_markers WHERE id='KEEP'",
      )) !== "1" ||
      (await cluster.sql(
        target,
        "SELECT count(*) FROM dr_wal_markers WHERE id='EXCLUDE'",
      )) !== "0"
    )
      throw new Error("Automatic WAL PITR recovered the wrong business point.");
    const rpoSeconds =
      (Date.parse(incidentAt) - Date.parse(committedAt)) / 1000;
    const rtoSeconds = (performance.now() - restoreStarted) / 1000;
    if (
      !Number.isFinite(rpoSeconds) ||
      rpoSeconds < 0 ||
      rpoSeconds > 900 ||
      rtoSeconds > 14400
    )
      throw new Error("Automatic WAL recovery missed RPO/RTO.");
    await writeFile(
      resolve(cluster.directory, "automatic-wal.json"),
      JSON.stringify(
        {
          passed: true,
          localOnly: true,
          forcedSwitchAfterMarker: false,
          sourceKilledBeforeRestore: true,
          backup: backup.label,
          segment,
          committedAt,
          target: time,
          incidentAt,
          archiveObservedAfterSeconds,
          rpoSeconds,
          physicalRtoSeconds: rtoSeconds,
          keptMarker: 1,
          excludedMarker: 0,
        },
        null,
        2,
      ),
    );
    passed = true;
  } finally {
    await finalizeDrill(cluster, { passed, automaticWalDrill: true }, () =>
      captureSourceDiagnostics(cluster),
    );
  }

  console.log(
    "Automatic WAL archival + source-crash PITR passed; local evidence only.",
  );
}
