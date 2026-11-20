import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DrillCluster, LABEL } from '../disaster-recovery/cluster.js';
import { docker, run } from '../disaster-recovery/process.js';
import { publishedPort } from '../performance/docker.js';
import { until } from './evidence.js';
import { runVirtualBrowser, virtualBrowserImage } from './virtual-browser.js';
async function main(): Promise<void> {
  const longSessionSeconds = process.argv.includes('--long-session') ? 1500 : 0;
  const cluster = DrillCluster.fresh();
  const backendImage = await docker(['image', 'inspect', '--format', '{{.Id}}', 'axon-performance-backend:phase10']);
  const webImage = await docker(['image', 'inspect', '--format', '{{.Id}}', 'axon-performance-web:phase10']);
  const directory = resolve(cluster.directory, 'private', 'web-quality');
  let passed = false;
  console.log('Phase10 web quality owner: ' + cluster.id);
  try {
    await cluster.create();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const secret = () => randomBytes(32).toString('hex');
    const database = await cluster.connection(cluster.source), jwt = secret(), admin = secret();
    const fixtureFile = resolve(directory, 'fixture.json');
    const environment = { ...process.env, DATABASE_URL: database, MIGRATION_DATABASE_URL: database, REQUIRE_EMPTY_DATABASE: 'true', DR_OWNER: cluster.id, NODE_ENV: 'test', JWT_SECRET: jwt, ADMIN_JWT_SECRET: admin, OPENAI_API_KEY: 'synthetic-no-network', PERF_TENANT_GROUPS: '1', PERF_USERS_PER_TENANT: '1', OBSERVABILITY_FIXTURE_FILE: fixtureFile };
    const shim = pathToFileURL(resolve('scripts/node26-tsx-shim.mjs')).href;
    for (const [name, file] of [['migration', 'scripts/deploy/migrate.ts'], ['fixture', 'scripts/observability/fixture.ts']] as const) {
      const result = await run(process.execPath, ['--import', shim, '--import', 'tsx', file], undefined, environment, resolve('apps/backend'));
      await writeFile(resolve(cluster.directory, `quality-${name}.log`), result.stdout + '\n' + result.stderr);
      if (result.code !== 0)
        throw new Error('Owned web fixture setup failed');
    }
    const create = (name: string, args: string[]) => docker(['run', '-d', '--init', '--name', cluster.id + '-' + name, '--label', LABEL + '=' + cluster.id, '--network', cluster.network, ...args]);
    await create('redis', ['--cpus', '0.5', '--memory', '256m', 'redis:7-alpine']);
    const caddy = resolve(directory, 'Caddyfile');
    await writeFile(caddy, `:8080 {\n @backend path /api/* /ready /health /metrics\n handle @backend {\n reverse_proxy ${cluster.id}-api-0:3001\n }\n handle {\n reverse_proxy ${cluster.id}-web:3000\n }\n}\n`);
    await create('proxy', ['--cpus', '0.5', '--memory', '256m', '-p', '127.0.0.1::8080', '--mount', `type=bind,src=${caddy},dst=/etc/caddy/Caddyfile,readonly`, 'caddy:2-alpine']);
    const origin = `http://127.0.0.1:${await publishedPort(cluster.id + '-proxy', 8080)}`;
    const env = { NODE_ENV: 'development', LOG_FORMAT: 'json', APP_ROLE: 'api', DATABASE_URL: `postgresql://postgres@${cluster.source}:5432/phase3_dr_ci?connection_limit=5&pool_timeout=2`, REDIS_URL: `redis://${cluster.id}-redis:6379`, JWT_SECRET: jwt, ADMIN_JWT_SECRET: admin, OPENAI_API_KEY: 'synthetic-no-network', ENCRYPTION_KEY: secret(), API_KEY_PEPPER: secret(), ALLOWED_ORIGINS: origin + ',http://127.0.0.1:8080', GLOBAL_RATE_LIMIT_PER_MINUTE: '100000', GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE: '100000', DOMAIN_EVENT_OUTBOX_WORKER_ENABLED: 'false', MARKETPLACE_WORKER_ENABLED: 'false', CHAT_ATTACHMENT_WORKER_ENABLED: 'false', PERSISTENT_OBSERVABILITY_ENABLED: 'false', STORAGE_DRIVER: 'local' };
    const envFile = resolve(directory, 'runtime.env');
    await writeFile(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
    await create('api-0', ['--cpus', '2', '--memory', '1g', '--read-only', '--tmpfs', '/tmp:size=64m,mode=1777', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--env-file', envFile, backendImage]);
    await create('web', ['--cpus', '1', '--memory', '768m', '--read-only', '--tmpfs', '/tmp:size=64m,mode=1777', '--tmpfs', '/app/apps/web/.next/cache:uid=1000,gid=1000,size=128m', '-e', 'HOSTNAME=0.0.0.0', webImage]);
    await until('owned production web and API readiness', async () => {
      const rows = await Promise.all(['/ready', '/login'].map(path => fetch(origin + path, { signal: AbortSignal.timeout(5000) }))); for (const row of rows)
        await row.body?.cancel(); return rows.every(row => row.ok);
    });
    const report = resolve(cluster.directory, 'web-quality');
    await mkdir(report, { recursive: true });
    const result = longSessionSeconds > 0
      ? await run(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.quality.config.ts'], undefined, { ...process.env, QUALITY_LONG_SESSION_SECONDS: String(longSessionSeconds), QUALITY_BASE_URL: origin, QUALITY_FIXTURE_FILE: fixtureFile, QUALITY_REPORT_DIRECTORY: report }, resolve('apps/web'))
      : await runVirtualBrowser(cluster, fixtureFile, report);
    await writeFile(resolve(cluster.directory, 'phase10-web-quality.log'), result.stdout + '\n' + result.stderr);
    const evidence: unknown = JSON.parse(await readFile(resolve(report, 'results.json'), 'utf8'));
    await writeFile(resolve(cluster.directory, 'phase10-web-environment.json'), JSON.stringify({ localOnly: true, productionWeb: true, longSessionSeconds, browserExecution: longSessionSeconds > 0 ? 'Native headless Chromium/CDP' : 'Owned Linux Xvfb headed Chromium and Firefox', browserImage: longSessionSeconds > 0 ? null : await docker(['image', 'inspect', '--format', '{{.Id}}', virtualBrowserImage]), backendMode: 'development-only owned synthetic fixture', webImage, backendImage, reportPresent: typeof evidence === 'object' }, null, 2));
    if (result.code !== 0)
      throw new Error('Owned Playwright quality failed; inspect saved report');
    passed = true;
  }
  finally {
    const failures: unknown[] = [];
    for (const name of ['api-0', 'web', 'proxy'])
      try {
        const value = await run('docker', ['logs', '--tail', '80', cluster.id + '-' + name]);
        await writeFile(resolve(cluster.directory, 'quality-' + name + '.log'), value.stdout + '\n' + value.stderr);
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
      const path = relative(resolve(cluster.directory, 'private'), directory);
      if (!path || path.startsWith('..') || isAbsolute(path))
        throw new Error('Unsafe private fixture path');
      await rm(directory, { recursive: true, force: true });
    }
    catch (error) {
      failures.push(error);
    }
    await writeFile(resolve(cluster.directory, 'phase10-web-quality.json'), JSON.stringify({ passed: passed && !failures.length, localOnly: true, owner: cluster.id, cleanupFailures: failures.length }, null, 2));
    if (failures.length)
      throw new AggregateError(failures, 'Owned web cleanup failed');
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Web quality failed'); process.exitCode = 1; });
