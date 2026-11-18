import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { assertSuccessfulTests } from "./validation.js";
import { finalizeDrill, captureSourceDiagnostics } from "./finalization.js";
import { automaticWalDrill } from "./automatic-wal.js";
import { DrillCluster, DR_IMAGE } from "./cluster.js";
import { docker, run } from "./process.js";

async function main(): Promise<void> {
  if (process.argv[2] === "wal" && process.argv.length === 3) {
    await automaticWalDrill();
    return;
  }
  if (process.argv[2] !== "drill" || process.argv.length !== 3)
    throw new Error(
      "Usage: dr:drill or dr:wal (creates synthetic isolated resources only).",
    );
  await docker(["info", "--format", "{{.ServerVersion}}"]);
  const cluster = DrillCluster.fresh();
  console.log(`DR drill owner: ${cluster.id}`);
  let success = false;
  let recoveryPassed = false;
  let regressionPassed = false;
  try {
    await cluster.create();
    await writeFile(
      resolve(cluster.directory, "runtime.json"),
      JSON.stringify(
        {
          image: await docker([
            "image",
            "inspect",
            "--format",
            "{{.Id}}",
            DR_IMAGE,
          ]),
          postgres: await docker([
            "exec",
            cluster.source,
            "postgres",
            "--version",
          ]),
          pgBackRest: await docker([
            "exec",
            "-u",
            "postgres",
            cluster.source,
            "pgbackrest",
            "version",
          ]),
          memory: "1GiB per database container",
          cpu: 2,
          localOnly: true,
        },
        null,
        2,
      ),
    );
    const url = await cluster.connection(cluster.source);
    const env = {
      ...process.env,
      DR_OWNER: cluster.id,
      CROSS_MODULE_DATABASE_URL: url,
      DATABASE_URL: url,
      MIGRATION_DATABASE_URL: url,
      REQUIRE_EMPTY_DATABASE: "true",
      NODE_ENV: "test",
    };
    const shim = pathToFileURL(resolve("scripts/node26-tsx-shim.mjs")).href;
    const migration = await run(
      process.execPath,
      ["--import", shim, "--import", "tsx", "scripts/deploy/migrate.ts"],
      undefined,
      env,
      resolve("apps/backend"),
    );
    await writeFile(
      resolve(cluster.directory, "migration.log"),
      migration.stdout + "\n" + migration.stderr,
    );
    if (migration.code !== 0) throw new Error("Isolated DR migration failed.");
    const tests = await run(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "apps/backend/vitest.disaster-recovery.config.mts",
      ],
      undefined,
      env,
    );
    await writeFile(
      resolve(cluster.directory, "tests.log"),
      tests.stdout + "\n" + tests.stderr,
    );
    if (tests.code !== 0)
      throw new Error(
        "DR drill failed. See owned artifacts; no acceptance criterion was bypassed.",
      );
    assertSuccessfulTests(
      JSON.parse(
        await readFile(resolve(cluster.directory, "vitest.json"), "utf8"),
      ),
    );
    recoveryPassed = true;
    console.log(
      "Physical/PITR recovery tests passed; running the full cross-module regression on the disposable source.",
    );
    // Docker may assign a different ephemeral loopback port after the deliberate
    // source crash/restart. Do not reuse the pre-crash connection coordinates.
    const regressionUrl = await cluster.connection(cluster.source);
    const regressionEnv = {
      ...env,
      DATABASE_URL: regressionUrl,
      CROSS_MODULE_DATABASE_URL: regressionUrl,
      MIGRATION_DATABASE_URL: regressionUrl,
      CROSS_MODULE_REPORT_DIRECTORY: resolve(cluster.directory, "cross-module"),
    };
    const regression = await run(
      process.execPath,
      [
        resolve("node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        "vitest.cross-module.config.mts",
      ],
      undefined,
      regressionEnv,
      resolve("apps/backend"),
    );
    await writeFile(
      resolve(cluster.directory, "cross-module.log"),
      regression.stdout + "\n" + regression.stderr,
    );
    if (regression.code === 0) {
      assertSuccessfulTests(
        JSON.parse(
          await readFile(
            resolve(cluster.directory, "cross-module/results.json"),
            "utf8",
          ),
        ),
      );
      regressionPassed = true;
    }
    success = recoveryPassed && regressionPassed;
    if (!success)
      throw new Error(
        "DR tests passed, but the cross-module regression failed.",
      );
  } finally {
    await finalizeDrill(
      cluster,
      { passed: success, recoveryPassed, regressionPassed },
      () => captureSourceDiagnostics(cluster),
    );
  }

  console.log("DR drill completed; staging validation is still required.");
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DR drill failed.");
  process.exitCode = 1;
});
