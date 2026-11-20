import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { PERFORMANCE_STAGES, type PerformanceProfile, type PerformanceStage } from '../../packages/types/src/performance.js';
import { proxyConfig } from '../release/deploy.js';
import { parseFixture } from './config.js';
import { docker, dockerLogs, dockerMetrics, publishedPort, waitForContainer } from './docker.js';
import { renderReport } from './report.js';
import { analyzeResources } from './analysis.js';
import { summarizeCPU } from './cpu-profile.js';
import { queueHealthy } from './queue.js';
import { actualTelemetryExportObserved, telemetryHealthy } from './telemetry-health.js';
import { resourceMetricResponses, resourceMetricsHistory } from './resource-metrics.js';
import { browserProbe } from './browser.js';
import { integer, object } from './validation.js';
import { performanceBudget } from './budget.js';
import { captureIndexProbe, capturePlans, captureSQL, performanceSQL } from './diagnostics.js';
import { commandResult } from '../release/process.js';
import { reconcileStorage } from './storage-reconciliation.js';
import { OperationalStack } from '../observability/stack.js';
import { writeOperationalConfiguration } from '../observability/configuration.js';
import { internalQuery, querySchema } from '../observability/evidence.js';

export async function localPerformance(): Promise<void> {
  const budget = performanceBudget(process.env);
  const profiling = process.env.PERF_CPU_PROFILE === 'true';
  const diagnostics = process.env.PERF_DIAGNOSTICS === 'true';
  const owner = `axon-perf-${randomUUID().slice(0, 8)}`;
  const output = resolve('artifacts', 'performance', owner); await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(output, 'private-'));
  const backend = process.env.PERF_BACKEND_IMAGE ?? 'axon-performance-backend:local';
  const migrator = process.env.PERF_MIGRATOR_IMAGE ?? 'axon-performance-migrator:local';
  const web = process.env.PERF_WEB_IMAGE ?? 'axon-performance-web:local';
  const secret = () => randomBytes(24).toString('hex'); const password = secret();
  const samples: unknown[] = []; const results: unknown[] = [];
  let network = false; let sampling: Promise<void> | null = null;
  let monitor: ReturnType<typeof setInterval> | undefined; let currentPhase = 'setup';
  let operationalStack: OperationalStack | undefined;
  const telemetry = process.env.PERF_TELEMETRY_MODE ?? 'off';
  const run = (name: string, args: readonly string[]) => docker(['run', '--detach', '--name', `${owner}-${name}`, '--label', `com.axon.performance=${owner}`, '--network', owner, ...args]);
  const tool = async (action: 'snapshot' | 'quota' | 'invariants' | 'explain-access'): Promise<unknown> => {
    const result = await commandResult('docker', ['exec', `${owner}-tools`, 'node', 'dist/scripts/performance/cli.js', action], process.env, { outputLimit: 2_000_000, failOnTruncation: true });
    if (result.exitCode !== 0) await writeFile(join(output, `${currentPhase}-${action}-failure.json`), JSON.stringify(result, null, 2));
    const value: unknown = JSON.parse(result.output);
    if (result.exitCode !== 0 && !(['quota', 'invariants'].includes(action) && object(value).passed === false)) throw new Error(`Performance ${action} command failed; inspect saved diagnostics.`);
    return value;
  };
  try {
    if (!['off','on'].includes(telemetry)) throw new Error('Unknown performance telemetry mode');
    await docker(['info', '--format', '{{json .NCPU}}']);
    if (process.env.PERF_SKIP_BUILD !== 'true') {
      const args = ['--build-arg', 'RELEASE_VERSION=0.0.0-phase8-local', '--build-arg', `RELEASE_GIT_SHA=${'0'.repeat(40)}`];
      for (const [target, image] of [['migrator', migrator], ['runner', backend]] as const) await docker(['build', '--target', target, ...args, '-f', 'apps/backend/Dockerfile', '-t', image, '.']);
      await docker(['build', ...args, '-f', 'apps/web/Dockerfile', '-t', web, '.']);
    }
    await docker(['network', 'create', owner]); network = true;
    const subnet = (await docker(['network', 'inspect', '--format', '{{(index .IPAM.Config 0).Subnet}}', owner])).trim();
    const pgEnv = join(temporary, 'postgres.env'); await writeFile(pgEnv, `POSTGRES_USER=phase8\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=phase8_local_ci\n`, { mode: 0o600 });
    await run('postgres', ['--cpus', '2', '--memory', '1g', '--env-file', pgEnv, 'postgres:17-alpine', '-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'max_connections=100', '-c', 'log_error_verbosity=verbose', '-c', 'log_lock_waits=on', '-c', 'deadlock_timeout=100ms', '-c', 'log_parameter_max_length_on_error=0']);
    await run('redis', ['--cpus', '0.5', '--memory', '256m', 'redis:7-alpine']);
    for (let attempt = 0; ; attempt++) {
      try { await docker(['exec', `${owner}-postgres`, 'pg_isready', '-U', 'phase8']); break; }
      catch { if (attempt >= 60) throw new Error('Isolated PostgreSQL failed to start.'); await pause(500); }
    }
    await run('certificate', [backend, 'tail', '-f', '/dev/null']);
    await docker(['exec', `${owner}-certificate`, 'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/qa.key', '-out', '/tmp/qa.crt', '-sha256', '-days', '1', '-subj', '/CN=phase8.example.test', '-addext', `subjectAltName=DNS:phase8.example.test,DNS:${owner}-provider,DNS:${owner}-proxy,IP:127.0.0.1`]);
    const certificate = join(temporary, 'qa.crt'); const key = join(temporary, 'qa.key');
    await docker(['cp', `${owner}-certificate:/tmp/qa.crt`, certificate]); await chmod(certificate, 0o644);
    await docker(['cp', `${owner}-certificate:/tmp/qa.key`, key]);
    const providerScript = resolve('artifacts/performance-tools/scripts/performance/provider.js');
    await run('provider', ['--cpus', '0.5', '--memory', '256m', '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`, '--mount', `type=bind,src=${key},dst=/qa.key,readonly`, '--mount', `type=bind,src=${providerScript},dst=/provider.mjs,readonly`, 'node:22-bookworm-slim', 'node', '/provider.mjs']);
    const proxyFile = join(temporary, 'Caddyfile');
    await writeFile(proxyFile, proxyConfig('phase8.example.test', 'blue').replace('phase8.example.test {', `phase8.example.test, ${owner}-proxy {\n tls /qa.crt /qa.key`).replaceAll('reverse_proxy {', 'reverse_proxy {\n trusted_proxies private_ranges'));
    await run('proxy', ['--cpus', String(budget.proxyCpu), '--memory', `${budget.proxyMemoryMiB}m`, '-p', '127.0.0.1::443', '--mount', `type=bind,src=${proxyFile},dst=/etc/caddy/Caddyfile,readonly`, '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`, '--mount', `type=bind,src=${key},dst=/qa.key,readonly`, 'caddy:2-alpine']);
    const proxyPort = await publishedPort(`${owner}-proxy`, 443);
    const schemaVersion = (await readdir('apps/backend/prisma/schema/migrations', { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().at(-1);
    const metricsToken = secret();
    if (telemetry === 'on') {
      await writeOperationalConfiguration();
      const replicas = integer(process.env.PERF_API_REPLICAS, 1, 1, 4);
      operationalStack = await OperationalStack.create({owner,network:owner,privateDirectory:join(temporary,'ops'),diagnosticsDirectory:output,apiTargets:Array.from({length:replicas},(_,index)=>`${owner}-api-${index}:3001`),workerTargets:[`${owner}-worker:3102`],metricsToken});
      await operationalStack.start();
    }
    const env: Record<string, string> = {
      NODE_ENV: 'production', DEPLOYMENT_ENV: 'local', EDOCUMENT_PROVIDER_MODE: 'mock', MOCK_MAIL: 'true', RELEASE_VERSION: '0.0.0-phase8-local', RELEASE_GIT_SHA: '0'.repeat(40), RELEASE_MIGRATION_VERSION: schemaVersion ?? '',
      DATABASE_URL: `postgresql://phase8:${password}@${owner}-postgres/phase8_local_ci?connection_limit=${budget.apiPool}&pool_timeout=10`,
      PERFORMANCE_DATABASE_URL: `postgresql://phase8:${password}@${owner}-postgres/phase8_local_ci?connection_limit=2&pool_timeout=5`,
      MIGRATION_DATABASE_URL: `postgresql://phase8:${password}@${owner}-postgres/phase8_local_ci`,
      REDIS_URL: `redis://${owner}-redis:6379`, APP_URL: `https://phase8.example.test:${proxyPort}`, ALLOWED_ORIGINS: `https://phase8.example.test,https://phase8.example.test:${proxyPort}`,
      JWT_SECRET: secret(), ADMIN_JWT_SECRET: secret(), ENCRYPTION_KEY: randomBytes(16).toString('hex'), API_KEY_PEPPER: secret(),
      STORAGE_DRIVER: 's3', S3_ENDPOINT: `https://${owner}-provider:9000`, S3_REGION: 'auto', S3_ACCESS_KEY_ID: secret(), S3_SECRET_ACCESS_KEY: secret(), S3_BUCKET: 'axon-perf',
      NODE_EXTRA_CA_CERTS: '/qa.crt', MALWARE_SCAN_MODE: 'enforce', MALWARE_SCAN_ENDPOINT: `https://${owner}-provider:9000/scan`,
      METRICS_ENABLED: 'true', METRICS_BEARER_TOKEN: metricsToken, TRUSTED_PROXY_CIDRS: subnet,
      TELEMETRY_ENABLED: telemetry === 'on' ? 'true' : 'false', TELEMETRY_SAMPLE_RATIO: '0.1',
      ...(telemetry === 'on' ? { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:'http://tempo:4318/v1/traces', LOG_EXPORT_ENDPOINT:'http://loki:3100/loki/api/v1/push' } : {}),
      PERF_TENANT_GROUPS: process.env.PERF_TENANT_GROUPS ?? '50', PERF_USERS_PER_TENANT: process.env.PERF_USERS_PER_TENANT ?? '5',
      DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS: String(budget.workerIntervalMs), DOMAIN_EVENT_OUTBOX_WORKER_ENABLED: 'false', MARKETPLACE_WORKER_ENABLED: 'false', CHAT_ATTACHMENT_WORKER_ENABLED: 'false', PERSISTENT_OBSERVABILITY_ENABLED: 'false',
    };
    const envFile = join(temporary, 'runtime.env'); await writeFile(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
    await docker(['run', '--rm', '--label', `com.axon.performance=${owner}`, '--network', owner, '--env-file', envFile, '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`, migrator]);
    await run('tools', ['--env-file', envFile, '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`, migrator, 'tail', '-f', '/dev/null']);
    await docker(['exec', `${owner}-tools`, 'node', 'dist/scripts/performance/cli.js', 'seed']);
    const fixtureFile = join(temporary, 'fixture.json'); await docker(['cp', `${owner}-tools:/tmp/performance-fixture.json`, fixtureFile]);
    const fixture = parseFixture(JSON.parse(await readFile(fixtureFile, 'utf8')) as unknown);
    const quota = await tool('quota');
    await writeFile(join(output, 'quota.json'), JSON.stringify(quota, null, 2));
    if (object(quota).passed !== true) throw new Error('Shared plan quota verification failed.');
    const runtime = ['--init', '--read-only', '--tmpfs', '/tmp:size=64m,mode=1777', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--env-file', envFile, '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`];
    const replicas = integer(process.env.PERF_API_REPLICAS, 1, 1, 4);
    for (let index = 0; index < replicas; index++) await run(`api-${index}`, [...runtime, '--cpus', String(budget.apiCpu), '--memory', `${budget.apiMemoryMiB}m`, '--network-alias', 'api-blue', '-e', 'APP_ROLE=api', '-e', 'REQUIRE_WORKER_READINESS=true', ...(profiling ? ['--mount', `type=bind,src=${output},dst=/profiles`] : []), backend, ...(profiling ? ['node', '--cpu-prof', `--cpu-prof-name=api-${index}.cpuprofile`, '--cpu-prof-dir=/profiles', 'dist/src/index.js'] : [])]);
    await run('worker', [...runtime, '--cpus', String(budget.workerCpu), '--memory', `${budget.workerMemoryMiB}m`, '-e', 'DATABASE_URL='+env.DATABASE_URL.replace(`connection_limit=${budget.apiPool}`, 'connection_limit=5'), '-e', 'APP_ROLE=worker', '-e', 'DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true', '-e', 'MARKETPLACE_WORKER_ENABLED=true', '-e', 'CHAT_ATTACHMENT_WORKER_ENABLED=true', '-e', 'PERSISTENT_OBSERVABILITY_ENABLED=true', backend]);
    await run('web', ['--init', '--cpus', '1', '--memory', '768m', '--read-only', '--tmpfs', '/tmp:size=64m,mode=1777', '--tmpfs', '/app/apps/web/.next/cache:uid=1000,gid=1000,size=128m', '--network-alias', 'web-blue', '-e', 'HOSTNAME=0.0.0.0', web]);
    for (let attempt = 0; ; attempt++) {
      try { await docker(['exec', `${owner}-tools`, 'node', '-e', `Promise.all(['/ready','/release','/release-info'].map(async path=>{const r=await fetch('https://${owner}-proxy'+path,{headers:{host:'phase8.example.test'},signal:AbortSignal.timeout(4000)});const b=await r.json();return r.ok&&(path==='/ready'?b.status==='ready':b.gitSha==='${'0'.repeat(40)}');})).then(rs=>process.exit(rs.every(Boolean)?0:1)).catch(()=>process.exit(1))`]); break; }
      catch { if (attempt >= 60) throw new Error('Performance API failed readiness.'); await pause(1000); }
    }
    const metadata = { scope: 'isolated-local-only', owner, runId: fixture.runId, syntheticUsers: fixture.actors.length, syntheticTenants: new Set(fixture.actors.map((actor) => actor.tenantId)).size, apiReplicas: replicas, poolPerApi: budget.apiPool, budget, profiling, diagnostics, workerReplicas: 1, workerOutboxIntervalMs: budget.workerIntervalMs, workerPool: 5, postgresCpuLimit: 2, apiCpuLimit: 2, loadGeneratorCpuLimit: budget.generatorCpu, dbMemoryBytes: 2 ** 30, apiMemoryBytes: 2 ** 30, builtFromDirtyWorkingTree: true, docker: JSON.parse(await docker(['info', '--format', '{{json .}}'])) as unknown,
      images: await Promise.all([backend, migrator, web].map((image) => docker(['image', 'inspect', '--format', '{{.Id}}', image]))) };
    // Docker info may contain host paths; publish only the hardware dimensions.
    const hardware = object(metadata.docker);
    await writeFile(join(output, 'environment.json'), JSON.stringify({ ...metadata, docker: { cpuCount: hardware.NCPU, memoryBytes: hardware.MemTotal, kernel: hardware.KernelVersion, operatingSystem: hardware.OperatingSystem } }, null, 2));
    const sample = async () => {
      const urls = Array.from({ length: replicas }, (_, index) => `http://${owner}-api-${index}:3001/metrics`);
      if (operationalStack) urls.push(`http://${owner}-worker:3102/metrics`);
      const [containers, database, apiText] = await Promise.all([dockerMetrics(owner), tool('snapshot'), docker(['exec', `${owner}-tools`, 'node', '-e', `Promise.all(${JSON.stringify(urls)}.map(async url=>{try{const r=await fetch(url,{headers:{authorization:'Bearer '+process.env.METRICS_BEARER_TOKEN},signal:AbortSignal.timeout(4000)});return {status:r.status,text:await r.text()};}catch{return {status:0,text:''};}})).then(x=>process.stdout.write(JSON.stringify(x)))`])]);
      const monitoring = operationalStack ? await operationalStack.resourceSnapshot() : undefined;
      const metricsValue: unknown = JSON.parse(apiText);
      const fullMetrics = resourceMetricResponses.parse(metricsValue);
      const api = resourceMetricsHistory(fullMetrics);
      // Overwrite one raw file per phase, rather than repeating every histogram
      // inside an ever-growing JSON array on every ten-second sample.
      await writeFile(join(output, `metrics-${currentPhase}.json`), JSON.stringify(fullMetrics.map(response => response.status === 200 ? response : { status: response.status, text: '' })));
      samples.push({ at: new Date().toISOString(), phase: currentPhase, containers, database, api, apiFullBytes: Buffer.byteLength(apiText), apiHistoryBytes: Buffer.byteLength(JSON.stringify(api)), monitoring });
      await writeFile(join(output, 'resources.json'), JSON.stringify(samples));
    };
    await sample();
    monitor = setInterval(() => { if (!sampling) sampling = sample().catch(() => { samples.push({ at: new Date().toISOString(), phase: currentPhase, unavailable: true }); }).finally(() => { sampling = null; }); }, 10_000);
    const profiles = (process.env.PERF_PROFILES ?? 'read,write,realtime,mixed').split(',');
    const stages = (process.env.PERF_STAGES ?? 'smoke,baseline,medium,target,stress').split(',');
    if (profiles.some((value) => !['read', 'write', 'upload', 'realtime', 'mixed'].includes(value)) || stages.some((value) => !Object.hasOwn(PERFORMANCE_STAGES, value))) throw new Error('Unknown selected workload.');
    const execute = async (profile: PerformanceProfile, stage: PerformanceStage, seconds: number) => {
      if (diagnostics) await performanceSQL(owner, 'SELECT pg_stat_statements_reset()');
      currentPhase = `${profile}-${stage}`;
      const name = `load-${profile}-${stage}`; console.info(`Starting ${profile}/${stage}: ${PERFORMANCE_STAGES[stage]} VUs, ${seconds} measured seconds.`);
      await run(name, ['--cpus', String(budget.generatorCpu), '--memory', `${budget.generatorMemoryMiB}m`, '--env-file', envFile, '--mount', `type=bind,src=${certificate},dst=/qa.crt,readonly`, '--mount', `type=bind,src=${fixtureFile},dst=/tmp/performance-fixture.json,readonly`, '--mount', `type=bind,src=${resolve('artifacts/performance-tools')},dst=/app/apps/backend/performance-tools,readonly`,
        '-e', `PERF_ORIGIN=https://${owner}-proxy`, '-e', `PERF_PROFILE=${profile}`, '-e', `PERF_STAGE=${stage}`, '-e', `PERF_SECONDS=${seconds}`, '-e', `PERF_THINK_MS=${process.env.PERF_THINK_MS ?? '1000'}`, '-e', `PERF_RAMP_SECONDS=${process.env.PERF_RAMP_SECONDS ?? '10'}`, '-e', `PERF_WARMUP_SECONDS=${process.env.PERF_WARMUP_SECONDS ?? '5'}`, backend, 'node', 'performance-tools/scripts/performance/cli.js', 'workload']);
      const exit = await waitForContainer(`${owner}-${name}`, (seconds + Number(process.env.PERF_RAMP_SECONDS ?? 10) + Number(process.env.PERF_WARMUP_SECONDS ?? 5) + 120) * 1000);
      await writeFile(join(output, `${profile}-${stage}.log`), await dockerLogs(`${owner}-${name}`));
      const file = join(output, `${profile}-${stage}.json`);
      let raw: Record<string, unknown>;
      if (exit === 0 || exit === 2) {
        await docker(['cp', `${owner}-${name}:/tmp/performance-result.json`, file]);
        raw = object(JSON.parse(await readFile(file, 'utf8')) as unknown);
      } else {
        const state = object(JSON.parse(await docker(['inspect', '--format', '{{json .State}}', `${owner}-${name}`])) as unknown);
        raw = { config: { profile, stage, users: PERFORMANCE_STAGES[stage], seconds }, passed: false, measurementValid: false, violations: 0, requestsPerSecond: 0, endpoints: {}, generatorFailure: { exitCode: exit, oomKilled: state.OOMKilled === true } };
      }
      if (diagnostics) await captureSQL(owner, output, `${profile}-${stage}`);
      if (diagnostics) await writeFile(join(output, `${profile}-${stage}-postgres.log`), await dockerLogs(`${owner}-postgres`));
      const backendSnapshot = await tool('snapshot');
      const invariantSnapshot = await tool('invariants');
      const integrityHealthy = object(invariantSnapshot).passed === true;
      const sampledQueues = samples.map(object).filter((sample) => sample.phase === currentPhase && !sample.unavailable).map((sample) => object(sample.database).queue);
      const queueValid = queueHealthy(object(backendSnapshot).queue) && sampledQueues.every(queueHealthy);
      const telemetryValid = operationalStack ? telemetryHealthy(samples, currentPhase, replicas + 1) : null;
      const result = { ...raw, backend: backendSnapshot, queueHealthy: queueValid, integrityHealthy, telemetryHealthy: telemetryValid, passed: raw.passed === true && queueValid && integrityHealthy && telemetryValid !== false }; results.push(result);
      await writeFile(file, JSON.stringify(result, null, 2));
      if (!result.passed) for (const role of [...Array.from({ length: replicas }, (_, index) => `api-${index}`), 'proxy', 'worker']) await writeFile(join(output, `${profile}-${stage}-${role}.log`), await dockerLogs(`${owner}-${role}`));
      console.info(JSON.stringify({ completed: `${profile}/${stage}`, passed: object(result).passed, requestsPerSecond: object(result).requestsPerSecond }));
      await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
      await writeFile(join(output, `${profile}-${stage}-invariants.json`), JSON.stringify(invariantSnapshot, null, 2));
      if (object(result).violations !== 0 || !integrityHealthy) throw new Error('Workload integrity/isolation invariant failed; stopping performance run.');
    };
    for (const profile of profiles) for (const stage of stages) await execute(profile as PerformanceProfile, stage as PerformanceStage, integer(process.env.PERF_SECONDS, 30, 10, 3600));
    if (process.env.PERF_SKIP_SOAK !== 'true') {
      const passed = results.map(object).filter((result) => result.passed === true && object(result.config).profile === 'mixed').map((result) => object(result.config));
      const stage = process.env.PERF_SOAK_STAGE ?? passed.sort((a, b) => Number(b.users) - Number(a.users))[0]?.stage ?? 'smoke';
      if (typeof stage !== 'string' || !Object.hasOwn(PERFORMANCE_STAGES, stage)) throw new Error('Unknown soak stage.');
      await execute('soak', stage as PerformanceStage, integer(process.env.PERF_SOAK_SECONDS, 1800, 10, 86_400));
    }
    if (diagnostics) { currentPhase = 'sql-diagnostics'; await capturePlans(owner, output, fixture); await captureIndexProbe(owner, output); }
    if (process.env.PERF_ACCESS_PLAN === 'true') await writeFile(join(output, 'explain-access-snapshot.json'), JSON.stringify(await tool('explain-access'), null, 2));
    const browserActor = fixture.actors.find((actor) => actor.plan === 'ENTERPRISE'); if (!browserActor) throw new Error('Browser fixture requires an Enterprise actor.');
    const browser = await browserProbe(`https://phase8.example.test:${proxyPort}`, browserActor); await writeFile(join(output, 'browser.json'), JSON.stringify(browser, null, 2));
    for (let attempt = 0; attempt < 30; attempt++) { const snapshot = object(await tool('snapshot')); const queue = object(snapshot.queue); if (queue.pending === 0 && queue.processing === 0) break; await pause(2000); }
    clearInterval(monitor); monitor = undefined; await sampling; await sample();
    const snapshot = await tool('snapshot'); const invariants = await tool('invariants');
    await writeFile(join(output, 'invariants.json'), JSON.stringify(invariants, null, 2));
    await writeFile(join(output, 'database.json'), JSON.stringify(snapshot, null, 2));
    const provider=await docker(['exec', `${owner}-provider`, 'node', '-e', "fetch('http://127.0.0.1:9001').then(r=>r.text()).then(t=>process.stdout.write(t))"]);
    await writeFile(join(output,'provider.json'),provider);
    const storageReconciliation=await reconcileStorage(owner,JSON.parse(provider) as unknown);
    await writeFile(join(output,'storage-reconciliation.json'),JSON.stringify(storageReconciliation,null,2));
    const pricing: unknown = JSON.parse(await readFile(process.env.PERF_PRICING_FILE ?? 'scripts/performance/pricing.example.json', 'utf8'));
    await writeFile(join(output, 'report.md'), renderReport(results, snapshot, pricing)+`\nStorage count/byte reconciliation: ${storageReconciliation.passed?'PASS':'FAIL'}. See storage-reconciliation.json; exact-key recovery is tested separately.\n`);
    await writeFile(join(output, 'resources.md'), analyzeResources(samples));
    const exporterEvidence = operationalStack ? querySchema.parse(await internalQuery(operationalStack.project + '-sink')('http://prometheus:9090/api/v1/query?query=' + encodeURIComponent('{__name__=~"axon_(telemetry_.*|log_export.*)"}'))) : null;
    if (operationalStack && !actualTelemetryExportObserved(exporterEvidence?.data.result)) throw new Error('Actual successful trace and log exports were not observed; telemetry measurement is invalid');
    await writeFile(join(output,'phase10-telemetry.json'),JSON.stringify({mode:telemetry,sampleRatio:telemetry==='on'?0.1:0,exporters:exporterEvidence,storage:operationalStack?JSON.parse(await operationalStack.storageSnapshot()):null,qualification:'Same Phase 8.2 application resource budget; monitoring service consumption is separately sampled in resources.json. Off mode retains Phase10 local instrumentation; the legacy backend comparison separately measures its combined runtime delta.'},null,2));
    if (profiling) for (let index = 0; index < replicas; index++) {
      await docker(['stop', '--time', '30', `${owner}-api-${index}`]);
      await writeFile(join(output, `api-${index}-cpu-summary.json`), JSON.stringify(summarizeCPU(JSON.parse(await readFile(join(output, `api-${index}.cpuprofile`), 'utf8')) as unknown), null, 2));
    }
    console.info(`Performance evidence written to ${output}`);
    if (results.some((value) => object(value).passed !== true)||!storageReconciliation.passed) process.exitCode = 2;
  } catch (error) {
    const names = (await docker(['ps', '--all', '--filter', `label=com.axon.performance=${owner}`, '--format', '{{.Names}}'])).split('\n').filter(Boolean);
    const diagnostics: Record<string, string> = {};
    for (const name of names) if (/^axon-perf-[a-f0-9]{8}-[a-z0-9-]+$/.test(name)) diagnostics[name] = await dockerLogs(name).catch(() => 'Container logs unavailable.');
    await writeFile(join(output, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
    throw error;
  } finally {
    if (monitor) clearInterval(monitor); await sampling;
    const cleanupFailures: unknown[] = [];
    try { if (operationalStack) await operationalStack.stop(); } catch (error) { cleanupFailures.push(error); }
    try {
      const ids = (await docker(['ps', '--all', '--filter', `label=com.axon.performance=${owner}`, '--format', '{{.ID}}'])).split('\n').filter(Boolean);
      if (ids.some(id=>!/^[a-f0-9]{12,64}$/.test(id))) throw new Error('Unexpected owned container identity');
      if (ids.length) await docker(['rm', '--force', '--volumes', ...ids]);
    } catch(error) { cleanupFailures.push(error); }
    try { if (network) await docker(['network', 'rm', owner]); } catch(error) { cleanupFailures.push(error); }
    try {
      if (!/^private-[a-z0-9]{6}$/i.test(relative(output, resolve(temporary)))) throw new Error('Unsafe performance temporary directory.');
      await rm(temporary, { recursive: true });
    } catch(error) { cleanupFailures.push(error); }
    if(cleanupFailures.length)throw new AggregateError(cleanupFailures,'Owned performance cleanup failed');
  }
}
