import { strict as assert } from 'node:assert';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type { ReleaseManifest } from './manifest.js';
import { command } from './process.js';
import { proxyConfig } from './deploy.js';
import { httpsProof } from './tls-assurance.js';

const storageFixture = `
  const fs = require('node:fs');
  let down = false;
  require('node:https').createServer({
    key: fs.readFileSync('/qa.key'), cert: fs.readFileSync('/qa.crt'),
  }, (request, response) => {
    const signedBucketProbe = request.method === 'HEAD' && request.url === '/axon-qa'
      && request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ');
    response.writeHead(signedBucketProbe ? (down ? 503 : 200) : 404);
    response.end();
  }).listen(9000, '0.0.0.0');
  require('node:http').createServer((request, response) => {
    down = request.url === '/down'; response.end('ok');
  }).listen(9001, '127.0.0.1');
`;

const loginFixture = `
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const db = new PrismaClient();
  (async () => {
    const tenant = await db.tenant.create({ data: {
      slug: 'phase7-login', companyName: 'Synthetic QA', email: 'phase7-login@example.test',
      status: 'ACTIVE', plan: 'ENTERPRISE',
    } });
    await db.user.create({ data: {
      email: 'phase7-login@example.test', name: 'Synthetic QA',
      password: await bcrypt.hash(process.env.QA_LOGIN_PASSWORD, 12),
      tenants: { create: { tenantId: tenant.id, isOwner: true } },
    } });
  })().finally(() => db.$disconnect());
`;

const webSocketDrainFixture = `
  const fs = require('node:fs');
  const WebSocket = require('ws');
  const deadline = setTimeout(() => process.exit(1), 20000);
  const socket = new WebSocket(process.env.QA_WS_URL, {
    servername: 'phase7.example.test', ca: fs.readFileSync('/qa.crt'),
    headers: { Host: 'phase7.example.test', Origin: 'https://phase7.example.test', Cookie: process.env.QA_SESSION_COOKIE },
  });
  socket.on('open', () => console.log('connected'));
  socket.on('error', () => { console.error('WebSocket assurance failed.'); process.exit(1); });
  socket.on('close', (code) => {
    clearTimeout(deadline); console.log(JSON.stringify({ code })); process.exit(code === 1012 ? 0 : 1);
  });
`;

async function readiness(origin: string, expected: number, dependency?: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/ready`, { signal: AbortSignal.timeout(6_000) });
      const body: unknown = await response.json();
      if (response.status === expected && body && typeof body === 'object' && 'checks' in body && body.checks && typeof body.checks === 'object'
        && (!dependency || (dependency in body.checks && Reflect.get(body.checks, dependency) === 'down'))) return;
    } catch { /* A process may still be starting or restarting. */ }
    await pause(1_000);
  }
  throw new Error(`Readiness did not reach ${expected}${dependency ? ` (${dependency})` : ''}.`);
}

/** Disposable Linux deployment proof. It never connects to a supplied business database. */
export async function verifyContainers(manifest: ReleaseManifest): Promise<void> {
  const owner = `axon-qa-${randomUUID().slice(0, 8)}`;
  const temporary = await mkdtemp(join(tmpdir(), 'axon-runtime-assurance-'));
  const label = `com.axon.assurance=${owner}`;
  const docker = (args: readonly string[]) => command('docker', args);
  const checks: string[] = [];
  const record = (name: string) => { checks.push(name); console.info(`Runtime assurance passed: ${name}`); };
  let networkCreated = false;
  try {
    await docker(['network', 'create', owner]); networkCreated = true;
    const secret = () => randomBytes(24).toString('hex');
    const password = secret();
    const pgEnv = join(temporary, 'postgres.env');
    await writeFile(pgEnv, `POSTGRES_USER=phase7\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=phase7_runtime_ci\n`, { mode: 0o600 });
    const run = (name: string, args: readonly string[]) => docker(['run', '--detach', '--name', `${owner}-${name}`, '--label', label, '--network', owner, ...args]);
    await run('postgres', ['--env-file', pgEnv, 'postgres:17-alpine']);
    await run('redis', ['redis:7-alpine']);
    for (let attempt = 0; ; attempt++) {
      try { await docker(['exec', `${owner}-postgres`, 'pg_isready', '-U', 'phase7']); break; }
      catch { if (attempt >= 60) throw new Error('Isolated PostgreSQL did not start.'); await pause(500); }
    }
    const migrationEnv = join(temporary, 'migration.env');
    await writeFile(migrationEnv, `MIGRATION_DATABASE_URL=postgresql://phase7:${password}@${owner}-postgres:5432/phase7_runtime_ci\n`, { mode: 0o600 });
    const migrations = await Promise.allSettled([1, 2].map(() => docker(['run', '--rm', '--label', label, '--network', owner, '--env-file', migrationEnv, manifest.images.migrator])));
    if (migrations.some((result) => result.status === 'rejected')) throw new Error('Concurrent migration deployment failed.');
    record('serialized-concurrent-migrations');
    await run('certificate', [manifest.images.backend, 'tail', '-f', '/dev/null']);
    await docker(['exec', `${owner}-certificate`, 'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/qa.key', '-out', '/tmp/qa.crt', '-sha256', '-days', '1',
      '-subj', '/CN=phase7.example.test', '-addext', `subjectAltName=DNS:${owner}-storage,DNS:phase7.example.test,IP:127.0.0.1`]);
    const certificateFile = join(temporary, 'qa.crt'); const keyFile = join(temporary, 'qa.key');
    await docker(['cp', `${owner}-certificate:/tmp/qa.crt`, certificateFile]); await chmod(certificateFile, 0o644);
    await docker(['cp', `${owner}-certificate:/tmp/qa.key`, keyFile]);
    const fixture = join(temporary, 'storage.cjs');
    await writeFile(fixture, storageFixture);
    await docker(['create', '--name', `${owner}-storage`, '--label', label, '--network', owner, 'node:22-bookworm-slim', 'node', '/storage.cjs']);
    await docker(['cp', fixture, `${owner}-storage:/storage.cjs`]);
    await docker(['cp', keyFile, `${owner}-storage:/qa.key`]);
    await docker(['cp', certificateFile, `${owner}-storage:/qa.crt`]);
    await docker(['start', `${owner}-storage`]);
    const values: Record<string, string> = {
      NODE_ENV: 'production', DEPLOYMENT_ENV: 'staging', RELEASE_VERSION: manifest.version, RELEASE_GIT_SHA: manifest.gitSha, RELEASE_MIGRATION_VERSION: manifest.migrationVersion,
      DATABASE_URL: `postgresql://phase7:${password}@${owner}-postgres:5432/phase7_runtime_ci?connection_limit=5&pool_timeout=10`,
      REDIS_URL: `redis://${owner}-redis:6379`, APP_URL: 'https://phase7.example.test', ALLOWED_ORIGINS: 'https://phase7.example.test',
      JWT_SECRET: secret(), ADMIN_JWT_SECRET: secret(), ENCRYPTION_KEY: randomBytes(16).toString('hex'), API_KEY_PEPPER: secret(),
      STORAGE_DRIVER: 's3', S3_ENDPOINT: `https://${owner}-storage:9000`, S3_REGION: 'auto', S3_ACCESS_KEY_ID: secret(), S3_SECRET_ACCESS_KEY: secret(), S3_BUCKET: 'axon-qa',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/axon-qa.crt', QA_LOGIN_PASSWORD: secret(),
      MALWARE_SCAN_MODE: 'enforce', MALWARE_SCAN_ENDPOINT: `http://${owner}-storage:9000/scan`, METRICS_ENABLED: 'false',
      PERSISTENT_OBSERVABILITY_ENABLED: 'true', CHAT_ATTACHMENT_WORKER_ENABLED: 'true', MARKETPLACE_WORKER_ENABLED: 'true', DOMAIN_EVENT_OUTBOX_WORKER_ENABLED: 'true',
    };
    const envFile = join(temporary, 'runtime.env');
    await writeFile(envFile, Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n'), { mode: 0o600 });
    const runtime = ['--init', '--env-file', envFile, '--read-only', '--tmpfs', '/tmp:rw,size=64m,mode=1777', '--mount', `type=bind,src=${certificateFile},dst=/etc/ssl/axon-qa.crt,readonly`];
    await run('api', [...runtime, '--network-alias', 'api-blue', '-e', 'APP_ROLE=api', '-e', 'REQUIRE_WORKER_READINESS=true',
      '-e', 'DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=false', '-e', 'MARKETPLACE_WORKER_ENABLED=false', '-e', 'PERSISTENT_OBSERVABILITY_ENABLED=false', '-e', 'CHAT_ATTACHMENT_WORKER_ENABLED=false',
      '-p', '127.0.0.1::3001', manifest.images.backend]);
    await run('worker', [...runtime, '--restart', 'unless-stopped', '-e', 'APP_ROLE=worker', '-p', '127.0.0.1::3102', manifest.images.backend]);
    const origin = async (name: string, port: number) => {
      for (let attempt = 0; attempt < 60; attempt++) {
        const ports: unknown = JSON.parse(await docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', `${owner}-${name}`]));
        const bindings: unknown = ports && typeof ports === 'object' ? Reflect.get(ports, `${port}/tcp`) : null;
        const binding: unknown = Array.isArray(bindings) ? bindings[0] : null;
        if (binding && typeof binding === 'object' && 'HostPort' in binding && typeof binding.HostPort === 'string' && /^\d+$/.test(binding.HostPort)) return `http://127.0.0.1:${binding.HostPort}`;
        await pause(500);
      }
      throw new Error('Test container did not publish its port.');
    };
    let api = await origin('api', 3001); let worker = await origin('worker', 3102);
    await readiness(api, 200); await readiness(worker, 200);
    const identity: unknown = await (await fetch(`${api}/release`)).json();
    assert.ok(identity && typeof identity === 'object' && 'gitSha' in identity && identity.gitSha === manifest.gitSha);
    record('api-worker-readiness-and-identity');
    await docker(['exec', `${owner}-storage`, 'node', '-e', "fetch('http://127.0.0.1:9001/down',{method:'POST'})"]);
    await readiness(api, 503, 'objectStorage'); assert.equal((await fetch(`${api}/health`)).status, 200);
    await docker(['exec', `${owner}-storage`, 'node', '-e', "fetch('http://127.0.0.1:9001/up',{method:'POST'})"]);
    await readiness(api, 200); record('storage-failure-and-recovery');
    await docker(['stop', `${owner}-redis`]); await readiness(api, 503, 'redis');
    assert.equal((await fetch(`${api}/health`)).status, 200);
    await docker(['start', `${owner}-redis`]); await readiness(api, 200); await readiness(worker, 200);
    record('redis-failure-and-recovery');
    await docker(['stop', '-t', '30', `${owner}-worker`]);
    assert.equal(await docker(['inspect', '--format', '{{.State.ExitCode}}', `${owner}-worker`]), '0');
    await readiness(api, 503, 'workers');
    await docker(['start', `${owner}-worker`]); worker = await origin('worker', 3102);
    await readiness(worker, 200); await readiness(api, 200);
    record('graceful-worker-handover');
    // Kill the application child, not via `docker kill`, which suppresses restart policy.
    await docker(['exec', `${owner}-worker`, 'node', '-e', "const fs=require('node:fs');const pid=Number(fs.readFileSync('/proc/1/task/1/children','utf8').trim().split(/\\s+/)[0]);if(!Number.isInteger(pid)||pid<2)throw new Error('Application PID unavailable');process.kill(pid,'SIGKILL');"]).catch(() => undefined);
    await pause(2_000); worker = await origin('worker', 3102); await readiness(worker, 200);
    assert.ok(Number(await docker(['inspect', '--format', '{{.RestartCount}}', `${owner}-worker`])) >= 1);
    record('worker-process-crash-and-restart');
    await pause(2_200);
    await docker(['exec', `${owner}-redis`, 'redis-cli', 'CLIENT', 'PAUSE', '3000', 'ALL']);
    const pending = fetch(`${api}/ready`, { signal: AbortSignal.timeout(6_000) }).catch(() => null);
    await pause(100); await docker(['kill', '--signal', 'SIGTERM', `${owner}-api`]);
    assert.equal((await pending)?.status, 503);
    await docker(['wait', `${owner}-api`]);
    assert.equal(await docker(['inspect', '--format', '{{.State.ExitCode}}', `${owner}-api`]), '0');
    record('in-flight-http-drain-before-exit');
    await docker(['start', `${owner}-api`]); api = await origin('api', 3001); await readiness(api, 200);
    await run('web', ['--init', '--network-alias', 'web-blue', '--read-only', '--tmpfs', '/tmp:rw,size=64m', '--tmpfs', '/app/apps/web/.next/cache:uid=1000,gid=1000,size=128m',
      '-e', 'HOSTNAME=0.0.0.0', '-e', `RELEASE_VERSION=${manifest.version}`, '-e', `RELEASE_GIT_SHA=${manifest.gitSha}`, '-p', '127.0.0.1::3000', manifest.images.web]);
    const web = await origin('web', 3000);
    for (let attempt = 0; ; attempt++) {
      try { if (!(await fetch(`${web}/ready`)).ok) throw new Error(); break; }
      catch { if (attempt >= 30) throw new Error('Web readiness failed.'); await pause(1_000); }
    }
    const webIdentity: unknown = await (await fetch(`${web}/release-info`, { redirect: 'error' })).json();
    assert.ok(webIdentity && typeof webIdentity === 'object' && 'gitSha' in webIdentity && webIdentity.gitSha === manifest.gitSha);
    record('standalone-web-readiness-and-version');
    const proxyFile = join(temporary, 'Caddyfile');
    await writeFile(proxyFile, proxyConfig('phase7.example.test', 'blue').replace('phase7.example.test {', 'phase7.example.test {\n  tls /qa.crt /qa.key'));
    await docker(['create', '--name', `${owner}-proxy`, '--label', label, '--network', owner, '-p', '127.0.0.1::443', 'caddy:2-alpine', 'caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']);
    for (const [source, destination] of [[proxyFile, '/etc/caddy/Caddyfile'], [keyFile, '/qa.key'], [certificateFile, '/qa.crt']] as const) await docker(['cp', source, `${owner}-proxy:${destination}`]);
    await docker(['start', `${owner}-proxy`]);
    const proxyPort = Number(new URL(await origin('proxy', 443)).port);
    const certificate = await readFile(certificateFile, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try { assert.equal((await httpsProof(proxyPort, certificate, '/ready')).status, 200); break; }
      catch { if (attempt >= 30) throw new Error('HTTPS proxy readiness failed.'); await pause(1_000); }
    }
    for (const path of ['/release', '/release-info']) {
      const result = await httpsProof(proxyPort, certificate, path);
      assert.equal(result.status, 200);
      assert.ok(result.body && typeof result.body === 'object' && 'gitSha' in result.body && result.body.gitSha === manifest.gitSha);
    }
    await docker(['exec', `${owner}-api`, 'node', '-e', loginFixture]);
    const login = await httpsProof(proxyPort, certificate, '/api/auth/login', { email: 'phase7-login@example.test', password: values.QA_LOGIN_PASSWORD });
    assert.equal(login.status, 200);
    const sessionCookie = login.cookies.find((cookie) => /;\s*Secure/i.test(cookie) && /;\s*HttpOnly/i.test(cookie) && /;\s*SameSite=Lax/i.test(cookie));
    assert.ok(sessionCookie);
    record('https-proxy-api-web-routing-and-secure-session-cookie');
    const sessionEnv = join(temporary, 'websocket.env');
    await writeFile(sessionEnv, `QA_SESSION_COOKIE=${sessionCookie.split(';')[0]}\n`, { mode: 0o600 });
    await run('ws-client', ['--env-file', sessionEnv, '--mount', `type=bind,src=${certificateFile},dst=/qa.crt,readonly`,
      '-e', `QA_WS_URL=wss://${owner}-proxy/api/chat/ws`, manifest.images.backend, 'node', '-e', webSocketDrainFixture]);
    for (let attempt = 0; ; attempt++) {
      if ((await docker(['logs', `${owner}-ws-client`])).trim() === 'connected') break;
      if (attempt >= 30) throw new Error('Authenticated WSS connection did not open.');
      await pause(250);
    }
    await docker(['kill', '--signal', 'SIGTERM', `${owner}-api`]);
    assert.equal(await docker(['wait', `${owner}-api`]), '0');
    assert.equal(await docker(['wait', `${owner}-ws-client`]), '0');
    const closed: unknown = JSON.parse((await docker(['logs', `${owner}-ws-client`])).split('\n').at(-1) ?? 'null');
    assert.ok(closed && typeof closed === 'object' && 'code' in closed && closed.code === 1012);
    record('authenticated-wss-drain-before-api-exit');
    await mkdir('artifacts/release-assurance', { recursive: true });
    await writeFile('artifacts/release-assurance/runtime.json', JSON.stringify({ success: true, gitSha: manifest.gitSha, imageHash: createHash('sha256').update(JSON.stringify(manifest.images)).digest('hex'), checks }, null, 2));
    console.info(JSON.stringify({ runtimeAssurance: 'passed', checks }));
  } finally {
    const ids = (await docker(['ps', '--all', '--filter', `label=${label}`, '--format', '{{.ID}}'])).split('\n').filter(Boolean);
    if (ids.length && ids.every((id) => /^[a-f0-9]{12,64}$/.test(id))) await docker(['rm', '--force', '--volumes', ...ids]);
    if (networkCreated) await docker(['network', 'rm', owner]);
    if (!/^axon-runtime-assurance-[^/\\]+$/.test(relative(resolve(tmpdir()), resolve(temporary)))) throw new Error('Unsafe temporary directory.');
    await rm(temporary, { recursive: true });
  }
}
