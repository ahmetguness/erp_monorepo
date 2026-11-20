import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { DrillCluster, LABEL } from "../disaster-recovery/cluster.js";
import { RecoveryOperations } from "../disaster-recovery/operations.js";
import { repositoryHealth } from "../disaster-recovery/health.js";
import { docker, run } from "../disaster-recovery/process.js";
import { publishedPort } from "../performance/docker.js";
import { parseFixture } from "../performance/config.js";
import { OperationalStack } from "./stack.js";
import { writeOperationalConfiguration, dashboards as dashboardSpecs } from "./configuration.js";
import { repositoryHealthMetrics, startRepositoryHealthFeed, } from "./dr-feed.js";
import { StartupFailure, until, notificationSchema, querySchema, internalQuery } from './evidence.js';
import { exerciseIncidents } from './incidents.js';
import { proveTraceGraph, proveFailedProviderTrace } from './trace-proof.js';
import { proveDrFilePipeline } from './dr-probe-evidence.js';
import { proveExporterOutage } from './exporter-outage.js';
async function main(): Promise<void> {
  const integrityOnly = process.argv.includes('--integrity-recovery');
  const cluster = DrillCluster.fresh("axon-postgres-dr:phase10");
  const privateDirectory = resolve(cluster.directory, "private", "observability");
  const image = await docker(["image", "inspect", "--format", "{{.Id}}", "axon-performance-backend:phase10"]);
  const steps: Array<{
    scenario: string;
    passed: boolean;
    at: string;
  }> = [];
  let stack: OperationalStack | undefined;
  let stopHealthFeed: ReturnType<typeof startRepositoryHealthFeed> | undefined;
  let passed = false;
  console.log(`Phase10 operational drill owner: ${cluster.id}`);
  const step = (scenario: string) => {
    steps.push({ scenario, passed: true, at: new Date().toISOString() });
    console.log(`Operational evidence: ${scenario} PASS`);
  };
  try {
    await cluster.create();
    await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(cluster.directory, "phase10-runtime.json"), JSON.stringify({ localOnly: true, backendImage: await docker(["image", "inspect", "--format", "{{.Id}}", image]), apiReplicas: 1, apiAndWorkerCpu: 2, apiAndWorkerMemoryBytes: 2 ** 30, postgresCpu: 2, postgresMemoryBytes: 2 ** 30, traceSampleRatio: 1, purpose: "Correctness and incident evidence, not workload capacity" }, null, 2));
    const database = await cluster.connection(cluster.source);
    const token = randomBytes(32).toString("hex");
    const jwt = randomBytes(32).toString("hex");
    const environment = {
      ...process.env,
      DR_OWNER: cluster.id,
      DATABASE_URL: database,
      MIGRATION_DATABASE_URL: database,
      REQUIRE_EMPTY_DATABASE: "true",
      NODE_ENV: "test",
      JWT_SECRET: jwt,
      ADMIN_JWT_SECRET: randomBytes(32).toString("hex"),
      OPENAI_API_KEY: "synthetic-no-network",
      PERF_TENANT_GROUPS: "1",
      PERF_USERS_PER_TENANT: "1",
      OBSERVABILITY_FIXTURE_FILE: resolve(privateDirectory, "fixture.json"),
    };
    const shim = pathToFileURL(resolve("scripts/node26-tsx-shim.mjs")).href;
    for (const [name, file] of [
      ["migration", "scripts/deploy/migrate.ts"],
      ["fixture", "scripts/observability/fixture.ts"],
    ] as const) {
      const result = await run(process.execPath, ["--import", shim, "--import", "tsx", file], undefined, environment, resolve("apps/backend"));
      await writeFile(resolve(cluster.directory, `phase10-${name}.log`), result.stdout + "\n" + result.stderr);
      if (result.code !== 0)
        throw new Error(`Owned operational ${name} failed`);
    }
    const fixture = parseFixture(JSON.parse(await readFile(environment.OBSERVABILITY_FIXTURE_FILE, "utf8")));
    const actor = fixture.actors[0];
    const operations = new RecoveryOperations(cluster);
    const backup = await operations.backup();
    await proveDrFilePipeline(cluster);
    step("Deployable backup scheduler writes actual completion state; independent read-only DR collector produces validated metrics");
    const feed = resolve(privateDirectory, "ops", "dr-feed", "metrics.prom");
    await writeOperationalConfiguration();
    stack = await OperationalStack.create({
      owner: cluster.id,
      network: cluster.network,
      privateDirectory: resolve(privateDirectory, "ops"),
      diagnosticsDirectory: cluster.directory,
      apiTargets: [cluster.id + "-api-0:3001"],
      workerTargets: [cluster.id + "-worker:3102"],
      metricsToken: token,
    });
    await writeFile(feed, repositoryHealthMetrics(await repositoryHealth(operations)));
    let backupFailed = false;
    stopHealthFeed = startRepositoryHealthFeed(operations, feed, () => backupFailed);
    await stack.start();
    const monitoring = stack;
    await until("monitoring backend readiness", async () => {
      const result = await docker([
        "exec",
        monitoring.project + "-sink",
        "node",
        "-e",
        "Promise.all(['http://prometheus:9090/-/ready','http://alertmanager:9093/-/ready','http://tempo:3200/ready','http://loki:3100/ready'].map(async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(4000)});await r.body?.cancel();return r.ok}catch{return false}})).then(rows=>process.stdout.write(JSON.stringify(rows.every(Boolean))))",
      ]);
      return result === "true";
    });
    const createRuntime = (name: string, args: string[]) => docker([
      "run",
      "-d",
      "--init",
      "--name",
      cluster.id + "-" + name,
      "--label",
      LABEL + "=" + cluster.id,
      "--network",
      cluster.network,
      ...args,
    ]);
    await createRuntime("redis", [
      "--cpus",
      "0.5",
      "--memory",
      "256m",
      "redis:7-alpine",
    ]);
    const controlDirectory = resolve(privateDirectory, "provider-control");
    await mkdir(controlDirectory, { recursive: true, mode: 0o755 });
    const faultFile = resolve(controlDirectory, "provider-fault");
    await writeFile(faultFile, "healthy");
    await createRuntime("certificate", [image, "tail", "-f", "/dev/null"]);
    await docker(["exec", cluster.id + "-certificate", "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "/tmp/qa.key", "-out", "/tmp/qa.crt", "-sha256", "-days", "1", "-subj", "/CN=phase10.example.test", "-addext", `subjectAltName=DNS:${cluster.id}-provider,IP:127.0.0.1`]);
    const certificate = resolve(privateDirectory, "qa.crt"), key = resolve(privateDirectory, "qa.key");
    await docker(["cp", cluster.id + "-certificate:/tmp/qa.crt", certificate]);
    await docker(["cp", cluster.id + "-certificate:/tmp/qa.key", key]);
    await createRuntime("provider", ["--cpus", "0.5", "--memory", "256m", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--mount", `type=bind,src=${certificate},dst=/qa.crt,readonly`, "--mount", `type=bind,src=${key},dst=/qa.key,readonly`, "--mount", `type=bind,src=${controlDirectory},dst=/control,readonly`, "--mount", `type=bind,src=${resolve('scripts/observability/provider-fixture.ts')},dst=/provider.ts,readonly`, "node:22-bookworm-slim", "node", "--experimental-strip-types", "/provider.ts"]);
    const env = {
      NODE_ENV: "development",
      LOG_FORMAT: "json",
      DATABASE_URL: `postgresql://postgres@${cluster.source}:5432/phase3_dr_ci?connection_limit=5&pool_timeout=2`,
      REDIS_URL: `redis://${cluster.id}-redis:6379`,
      JWT_SECRET: jwt,
      ADMIN_JWT_SECRET: environment.ADMIN_JWT_SECRET,
      OPENAI_API_KEY: "synthetic-no-network",
      ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      API_KEY_PEPPER: randomBytes(32).toString("hex"),
      ALLOWED_ORIGINS: "http://127.0.0.1:3100",
      DR_METRICS_FILE: "/run/axon-dr/metrics.prom",
      METRICS_ENABLED: "true",
      METRICS_BEARER_TOKEN: token,
      TELEMETRY_ENABLED: "true",
      TELEMETRY_SAMPLE_RATIO: "1",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://tempo:4318/v1/traces",
      LOG_EXPORT_ENDPOINT: "http://loki:3100/loki/api/v1/push",
      DOMAIN_EVENT_OUTBOX_WORKER_ENABLED: "false",
      MARKETPLACE_WORKER_ENABLED: "false",
      CHAT_ATTACHMENT_WORKER_ENABLED: "false",
      PERSISTENT_OBSERVABILITY_ENABLED: "false",
      GLOBAL_RATE_LIMIT_PER_MINUTE: "100000",
      GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE: "100000",
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: `https://${cluster.id}-provider:9000`, S3_REGION: "auto", S3_ACCESS_KEY_ID: randomBytes(24).toString("hex"), S3_SECRET_ACCESS_KEY: randomBytes(24).toString("hex"), S3_BUCKET: "axon-perf",
      NODE_EXTRA_CA_CERTS: "/qa.crt", READINESS_STORAGE_PROBE: "true", MALWARE_SCAN_MODE: "enforce", MALWARE_SCAN_ENDPOINT: `https://${cluster.id}-provider:9000/scan`,
      ALLOW_LOCAL_UPLOADS_IN_PRODUCTION: "false",
    };
    const envFile = resolve(privateDirectory, "runtime.env");
    await writeFile(envFile, Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"), { mode: 0o600 });
    const runtime = [
      "--cpus",
      "2",
      "--memory",
      "1g",
      "--read-only",
      "--tmpfs",
      "/tmp:size=64m,mode=1777",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--env-file",
      envFile,
      "--mount", `type=bind,src=${certificate},dst=/qa.crt,readonly`,
      "--mount", `type=bind,src=${resolve(privateDirectory, "ops", "dr-feed")},dst=/run/axon-dr,readonly`,
    ];
    await createRuntime("worker", [
      ...runtime,
      "-e",
      "APP_ROLE=worker",
      "-e",
      "DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true",
      "-e",
      "DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS=250",
      image,
    ]);
    await createRuntime("api-0", [
      ...runtime,
      "-p",
      "127.0.0.1::3001",
      "-e",
      "APP_ROLE=api",
      "-e",
      "REQUIRE_WORKER_READINESS=true",
      image,
    ]);
    const port = await publishedPort(cluster.id + "-api-0", 3001);
    let origin = `http://127.0.0.1:${port}`;
    const api = async () => fetch(origin + "/api/products", {
      headers: { authorization: `Bearer ${actor.token}` },
      signal: AbortSignal.timeout(10000),
    });
    const query = internalQuery(monitoring.project + '-sink');
    const notifications = async () => notificationSchema.parse(await query(`http://${monitoring.project}-sink:9002/alerts`));
    await until("API and worker readiness", async () => {
      for (const name of ["api-0", "worker"]) {
        const status = await docker(["inspect", "--format", "{{.State.Status}}", cluster.id + "-" + name]);
        if (status === "exited" || status === "dead")
          throw new StartupFailure("Owned API/worker exited during startup; inspect saved diagnostics");
      }
      return (await fetch(origin + "/ready", { signal: AbortSignal.timeout(5000) })).ok;
    });
    const response = await api();
    if (!response.ok)
      throw new Error("Real ERP read failed");
    const parent = response.headers.get("traceparent");
    const traceId = parent?.split("-")[1];
    if (!traceId || !/^[a-f0-9]{32}$/.test(traceId))
      throw new Error("HTTP trace context missing");
    await response.arrayBuffer();
    await until("Prometheus real API metrics", async () => querySchema.parse(await query("http://prometheus:9090/api/v1/query?query=axon_http_request_duration_seconds_count")).data.result.length > 0);
    step("Prometheus scrapes authenticated ERP API and worker");
    await until("Tempo HTTP/database trace", async () => {
      const value = await query(`http://tempo:3200/api/traces/${traceId}`);
      const json = JSON.stringify(value);
      return (json.includes("http.request") && json.includes("database.operation"));
    });
    step("Tempo stores real parent HTTP and database spans");
    const logQuery = encodeURIComponent(`{service="axon-api"} | json | traceId="${traceId}"`);
    await until("Loki correlated JSON log", async () => querySchema.parse(await query(`http://loki:3100/loki/api/v1/query_range?query=${logQuery}&limit=20`)).data.result.length > 0);
    step("Loki stores redacted JSON with the same trace ID");
    const grafanaPassword = (await readFile(resolve(privateDirectory, "ops/grafana-password"), "utf8")).trim();
    const grafana = await docker([
      "port",
      stack.project + "-grafana-1",
      "3000/tcp",
    ]);
    const grafanaPort = /:(\d+)\s*$/.exec(grafana)?.[1];
    if (!grafanaPort)
      throw new Error("Grafana loopback port missing");
    await until("Grafana private readiness", async () => (await fetch(`http://127.0.0.1:${grafanaPort}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })).ok);
    const dashboards = await fetch(`http://127.0.0.1:${grafanaPort}/api/search?type=dash-db`, {
      headers: {
        authorization: "Basic " +
          Buffer.from("admin:" + grafanaPassword).toString("base64"),
      },
    });
    if (!dashboards.ok ||
      z
        .array(z.object({ uid: z.string() }))
        .parse(await dashboards.json())
        .filter((row) => row.uid.startsWith("axon-")).length !== 8)
      throw new Error("Eight provisioned Grafana dashboards not verified");
    step("Eight real datasource Grafana dashboards are provisioned");
    if (!integrityOnly) {
    await cluster.assertOwned("container", cluster.id + "-api-0");
    await docker(["kill", "--signal", "KILL", cluster.id + "-api-0"]);
    await until("API crash alert delivery", async () => (await notifications()).some((alert) => alert.name === "ApiReplicaDown" && alert.status === "firing"));
    await docker(["start", cluster.id + "-api-0"]);
    origin = `http://127.0.0.1:${await publishedPort(cluster.id + "-api-0", 3001)}`;
    await until("API crash recovery alert delivery", async () => (await notifications()).some((alert) => alert.name === "ApiReplicaDown" && alert.status === "resolved"));
    if (!(await api()).ok)
      throw new Error("ERP did not recover after API crash");
    step("Real API SIGKILL triggers and resolves a delivered alert, ERP read recovers");
    await cluster.assertOwned("container", cluster.source);
    try {
      await docker(["pause", cluster.source]);
      await until("PostgreSQL outage alert delivery", async () => (await notifications()).some((alert) => alert.name === "PostgresProbeFailure" && alert.status === "firing"));
    }
    finally {
      await docker(["unpause", cluster.source]);
    }
    await until("PostgreSQL recovery alert delivery", async () => (await notifications()).some((alert) => alert.name === "PostgresProbeFailure" && alert.status === "resolved"));
    if (!(await api()).ok)
      throw new Error("ERP did not recover after PostgreSQL outage");
    step("Real PostgreSQL suspension triggers and resolves a delivered independent probe alert");
    }
    const capture = async (scenario: string, response: Response) => {
      const trace = response.headers.get('traceparent')?.split('-')[1];
      const status = response.status;
      await response.body?.cancel();
      if (!trace || !/^[a-f0-9]{32}$/.test(trace))
        throw new Error('Incident trace context missing');
      let traceData: unknown, logs: unknown;
      await until(scenario + ' real trace', async () => {
        traceData = await query(`http://tempo:3200/api/traces/${trace}`); proveTraceGraph(traceData, trace, ['http.request']); if (scenario.startsWith('provider-') && scenario !== 'provider-recovery')
          proveFailedProviderTrace(traceData); return true;
      });
      const expression = encodeURIComponent(`{service="axon-api"} | json | traceId="${trace}"`);
      await until(scenario + ' correlated log', async () => { logs = await query(`http://loki:3100/loki/api/v1/query_range?query=${expression}&limit=20`); return querySchema.parse(logs).data.result.length > 0; });
      await writeFile(resolve(cluster.directory, 'evidence-' + scenario + '.json'), JSON.stringify({ scenario, status, traceId: trace, trace: traceData, logs }, null, 2));
    };
    const captureOperation = async (scenario: string, operation: string, since: number, required: readonly string[]) => {
      const expression = encodeURIComponent(`{service="axon-api"} | json | operation="${operation}"`);
      let logs: unknown, traceData: unknown, foundTrace = '';
      await until(scenario + ' correlated log and complete trace', async () => {
        logs = await query(`http://loki:3100/loki/api/v1/query_range?query=${expression}&start=${BigInt(since) * 1000000n}&limit=50`);
        const results = z.object({ data: z.object({ result: z.array(z.object({ values: z.array(z.tuple([z.string(), z.string()])) })) }) }).parse(logs).data.result;
        for (const row of results.flatMap(result => result.values)) {
          const entry = z.object({ traceId: z.string().regex(/^[a-f0-9]{32}$/), operation: z.string(), result: z.string() }).safeParse(JSON.parse(row[1]));
          if (entry.success && entry.data.operation === operation && entry.data.result === 'failure') {
            foundTrace = entry.data.traceId;
            traceData = await query(`http://tempo:3200/api/traces/${foundTrace}`);
            proveTraceGraph(traceData, foundTrace, required);
            return true;
          }
        }
        return false;
      });
      await writeFile(resolve(cluster.directory, 'evidence-' + scenario + '.json'), JSON.stringify({ scenario, traceId: foundTrace, trace: traceData, logs }, null, 2));
    };
    await capture('api-and-postgres-recovery', await api());
    await exerciseIncidents({
      cluster, operations, actor, faultFile, query, origin: () => origin, step, capture, captureOperation,
      setBackupFailure: failed => { backupFailed = failed; },
      recoverDatabase: async (time) => {
        const tables = ['invoices', 'invoice_lines', 'payments', 'payment_allocations', 'journal_entries', 'journal_entry_lines', 'account_entries', 'stock_movements', 'stock_levels', 'domain_event_outbox', 'domain_event_deliveries', 'platform_admin_audit_logs'];
        const checkpointSql = 'SELECT jsonb_build_object(' + tables.map(table => `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM ${table} t${table === 'platform_admin_audit_logs' ? " WHERE id<>'synthetic-corrupt-entry'" : ''})`).join(',') + ')::text';
        const before = createHash('sha256').update(await cluster.sql(cluster.source, checkpointSql)).digest('hex');
        const target = await operations.newTarget('audit');
        await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, { backup: backup.label, time });
        for (const name of ['api-0', 'worker']) {
          await cluster.assertOwned('container', cluster.id + '-' + name);
          await docker(['rm', '-f', cluster.id + '-' + name]);
        }
        const recoveredDatabase = `postgresql://postgres@${target}:5432/phase3_dr_ci?connection_limit=5&pool_timeout=2`;
        await createRuntime('worker', [...runtime, '-e', 'DATABASE_URL=' + recoveredDatabase, '-e', 'APP_ROLE=worker', '-e', 'DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true', '-e', 'DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS=250', image]);
        await createRuntime('api-0', [...runtime, '-p', '127.0.0.1::3001', '-e', 'DATABASE_URL=' + recoveredDatabase, '-e', 'APP_ROLE=api', '-e', 'REQUIRE_WORKER_READINESS=true', image]);
        origin = `http://127.0.0.1:${await publishedPort(cluster.id + '-api-0', 3001)}`;
        await until('PITR API readiness', async () => (await fetch(origin + '/ready', { signal: AbortSignal.timeout(5000) })).ok);
        const state = await cluster.sql(target, `SELECT count(*) FROM platform_admin_audit_logs WHERE id='synthetic-corrupt-entry'`);
        if (state !== '0')
          throw new Error('PITR retained synthetic corruption');
        const after = createHash('sha256').update(await cluster.sql(target, checkpointSql)).digest('hex');
        if (before !== after)
          throw new Error('Acknowledged business/audit data changed during isolated PITR');
        await writeFile(resolve(cluster.directory, 'phase10-pitr-integrity.json'), JSON.stringify({ algorithm: 'SHA-256', tables, before, after, syntheticCorruptEntryExcluded: true }, null, 2));
        await writeFile(resolve(cluster.directory, 'phase10-audit-recovery.json'), JSON.stringify({ target, recoveryTime: time, backup: backup.label, excludedCorruption: true, appendOnlyTriggersUnchanged: true }, null, 2));
      }
    }, integrityOnly ? 'integrity-recovery' : 'all');
    await proveExporterOutage(cluster, monitoring, origin, actor, token);
    await capture('exporter-recovery', await api());
    step('Real Tempo and Loki outage drops diagnostic exports; payment and idempotent replay succeed, exporters recover');
    const dashboardEvidence = [];
    for (const dashboard of dashboardSpecs) {
      const panels = [];
      for (const [title, expression] of dashboard.panels) {
        const value = await query('http://prometheus:9090/api/v1/query?query=' + encodeURIComponent(expression));
        const result = querySchema.parse(value);
        panels.push({ title, expression, data: result.data });
      }
      if (!panels.some(panel => panel.data.result.length > 0))
        throw new Error('No real metric data on dashboard ' + dashboard.uid);
      dashboardEvidence.push({ uid: dashboard.uid, panels });
    }
    await writeFile(resolve(cluster.directory, 'phase10-dashboard-queries.json'), JSON.stringify(dashboardEvidence, null, 2));
    await writeFile(resolve(cluster.directory, 'phase10-monitoring-storage.json'), await monitoring.storageSnapshot());
    step('Every dashboard query executes against real Prometheus; all eight contain measured series');
    await writeFile(resolve(cluster.directory, "phase10-notifications.json"), JSON.stringify(await notifications(), null, 2));
    await writeFile(resolve(cluster.directory, "phase10-resources.json"), await docker([
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
      ...(await docker([
        "ps",
        "--filter",
        `label=com.axon.observability=${stack.project}`,
        "--format",
        "{{.Names}}",
      ]))
        .split("\n")
        .filter(Boolean),
    ]));
    passed = true;
  }
  finally {
    const failures: unknown[] = [];
    if (stopHealthFeed) {
      try {
        const feedResult = await stopHealthFeed();
        await writeFile(resolve(cluster.directory, "phase10-dr-feed.json"), JSON.stringify(feedResult, null, 2));
        if (feedResult.writeFailures)
          throw new Error("DR telemetry write failed");
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (stack) {
      try {
        const names = (await docker([
          "ps",
          "-a",
          "--filter",
          `label=com.axon.observability=${stack.project}`,
          "--format",
          "{{.Names}}",
        ]))
          .split("\n")
          .filter(Boolean);
        for (const name of names) {
          const result = await run("docker", ["logs", "--tail", "200", name]);
          await writeFile(resolve(cluster.directory, name + ".log"), result.stdout + "\n" + result.stderr);
        }
      }
      catch (error) {
        failures.push(error);
      }
      try {
        await stack.stop();
      }
      catch (error) {
        failures.push(error);
      }
    }
    try {
      const names = (await docker([
        "ps",
        "-a",
        "--filter",
        `label=${LABEL}=${cluster.id}`,
        "--format",
        "{{.Names}}",
      ]))
        .split("\n")
        .filter(Boolean);
      for (const name of names) {
        await cluster.assertOwned("container", name);
        const result = await run("docker", ["logs", "--tail", "200", name]);
        await writeFile(resolve(cluster.directory, name + ".log"), result.stdout + "\n" + result.stderr);
      }
    }
    catch (error) {
      failures.push(error);
    }
    try {
      await cluster.cleanup();
    }
    catch (error) {
      failures.push(error);
    }
    try {
      await cluster.removeSecrets();
    }
    catch (error) {
      failures.push(error);
    }
    try {
      const path = relative(resolve(cluster.directory, "private"), privateDirectory);
      if (path.startsWith("..") || isAbsolute(path) || !path)
        throw new Error("Unsafe ephemeral secrets path");
      await rm(privateDirectory, { recursive: true, force: true });
    }
    catch (error) {
      failures.push(error);
    }
    await writeFile(resolve(cluster.directory, "phase10-operations.json"), JSON.stringify({
      passed: passed && !failures.length,
      steps,
      localOnly: true,
      cleanupFailures: failures.length,
      owner: cluster.id,
      incidentScope: integrityOnly ? 'integrity-recovery' : 'all',
    }, null, 2));
    if (failures.length)
      throw new AggregateError(failures, "Operational drill cleanup failed");
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Operational drill failed");
  process.exitCode = 1;
});
