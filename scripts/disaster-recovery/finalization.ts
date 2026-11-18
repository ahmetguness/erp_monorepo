import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DrillCluster } from "./cluster.js";
import { run } from "./process.js";

type FinalizableDrill = Pick<
  DrillCluster,
  "id" | "directory" | "cleanup" | "removeSecrets"
>;
export interface DrillOutcome {
  passed: boolean;
  recoveryPassed?: boolean;
  regressionPassed?: boolean;
  automaticWalDrill?: boolean;
}

export async function captureSourceDiagnostics(
  cluster: DrillCluster,
): Promise<void> {
  const logs = await run("docker", ["logs", "--tail", "1500", cluster.source]);
  await writeFile(
    resolve(cluster.directory, "source-postgres.log"),
    logs.stdout + "\n" + logs.stderr,
    { mode: 0o600 },
  );
  const state = await run("docker", [
    "inspect",
    "--format",
    "{{json .State}}",
    cluster.source,
  ]);
  await writeFile(
    resolve(cluster.directory, "source-state.json"),
    state.stdout,
    { mode: 0o600 },
  );
  if (logs.code !== 0 || state.code !== 0) throw new Error('Source diagnostics could not be captured completely.');
}

// Diagnostics and individual cleanup failures must never skip later cleanup.
// Publish overall PASS only after resource and secret removal have succeeded.
export async function finalizeDrill(
  cluster: FinalizableDrill,
  outcome: DrillOutcome,
  diagnostics?: () => Promise<void>,
): Promise<void> {
  const failures: unknown[] = [];
  for (const operation of [
    diagnostics,
    () => cluster.cleanup(),
    () => cluster.removeSecrets(),
  ]) {
    if (!operation) continue;
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await writeFile(
      resolve(cluster.directory, "outcome.json"),
      JSON.stringify(
        {
          ...outcome,
          owner: cluster.id,
          localOnly: true,
          passed: outcome.passed && failures.length === 0,
          finalizationPassed: failures.length === 0,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } catch (error) {
    failures.push(error);
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "DR finalization failed; the run is not a complete PASS.",
    );
}
