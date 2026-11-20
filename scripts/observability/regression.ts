import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile, readFile } from "node:fs/promises";
import { DrillCluster, LABEL } from "../disaster-recovery/cluster.js";
import { docker, run } from "../disaster-recovery/process.js";
import { assertSuccessfulTests } from "../disaster-recovery/validation.js";
import { publishedPort } from "../performance/docker.js";
import { until } from "./evidence.js";
async function main(): Promise<void> {
  const integration = process.argv.includes("--integration");
  const governance = process.argv.includes("--governance");
  const suite = integration ? "integration" : governance ? "governance" : "cross-module";
  const cluster = DrillCluster.fresh();
  console.log(`Phase10 isolated regression owner: ${cluster.id}`);
  let passed = false;
  try {
    await cluster.create();
    const database = await cluster.connection(cluster.source);
    let redisUrl: string | undefined;
    if (integration) {
      const redis = cluster.id + "-redis";
      await docker(["run", "-d", "--init", "--name", redis, "--label", LABEL + "=" + cluster.id, "--network", cluster.network, "--cpus", "0.5", "--memory", "256m", "--publish", "127.0.0.1::6379", "redis:7-alpine"]);
      await until("owned integration Redis readiness", async () => await docker(["exec", redis, "redis-cli", "ping"]) === "PONG");
      redisUrl = `redis://127.0.0.1:${await publishedPort(redis, 6379)}`;
    }
    const env = {
      ...process.env,
      DATABASE_URL: database,
      MIGRATION_DATABASE_URL: database,
      CROSS_MODULE_DATABASE_URL: database,
      CROSS_MODULE_REPORT_DIRECTORY: resolve(cluster.directory, "cross-module"),
      REQUIRE_EMPTY_DATABASE: "true",
      NODE_ENV: "test",
      DR_OWNER: cluster.id,
      ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
      INTEGRATION_SUITE: "all",
    };
    const shim = pathToFileURL(resolve("scripts/node26-tsx-shim.mjs")).href;
    const migration = await run(process.execPath, ["--import", shim, "--import", "tsx", "scripts/deploy/migrate.ts"], undefined, env, resolve("apps/backend"));
    await writeFile(resolve(cluster.directory, "phase10-migration.log"), migration.stdout + "\n" + migration.stderr);
    if (migration.code !== 0)
      throw new Error("Owned Phase10 migration failed");
    if (integration) {
      const seed = await run(process.execPath, ["--import", shim, "--import", "tsx", "scripts/observability/integration-seed.ts"], undefined, env, resolve("apps/backend"));
      await writeFile(resolve(cluster.directory, "phase10-integration-seed.log"), seed.stdout + "\n" + seed.stderr);
      if (seed.code !== 0) throw new Error("Owned integration catalog preparation failed");
    }
    const result = await run(process.execPath, integration ? ["--import", shim, "--import", "tsx", "scripts/run-integration-tests.ts"] : [
      resolve("node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.cross-module.config.mts",
      ...(governance ? ["tests/cross-module/scenarios/observability-governance.test.ts"] : []),
    ], undefined, env, resolve("apps/backend"));
    await writeFile(resolve(cluster.directory, `phase10-${suite}.log`), result.stdout + "\n" + result.stderr);
    if (result.code !== 0)
      throw new Error(`Phase10 ${suite} regression failed; inspect owned artifacts`);
    if (integration) {
      for (const name of ["foundation", "finance", "operations"]) {
        if (!result.stdout.includes(`Integration suite ${name}: OK`))
          throw new Error(`Missing integration completion evidence: ${name}`);
      }
    } else {
      assertSuccessfulTests(JSON.parse(await readFile(resolve(cluster.directory, "cross-module/results.json"), "utf8")));
    }
    passed = true;
  }
  finally {
    try {
      await cluster.cleanup();
    }
    finally {
      await cluster.removeSecrets();
    }
    await writeFile(resolve(cluster.directory, "phase10-regression.json"), JSON.stringify({ passed, suite, realRedis: integration, localOnly: true, owner: cluster.id, cleanupCompleted: true }, null, 2));
  }
  console.log(`Phase10 isolated ${suite} regression PASS; owned resources removed.`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Phase10 regression failed");
  process.exitCode = 1;
});
