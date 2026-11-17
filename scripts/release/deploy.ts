import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { assertCompatible, parseManifest, type ReleaseManifest } from './manifest.js';
import { command } from './process.js';
import { acquireDeploymentLock, atomicWrite, readState, requirePrivateEnv, snapshotDefinition, type DeploymentState } from './state.js';

export interface DeployConfig {
  environment: 'staging' | 'production';
  root: string;
  envFile: string;
  host: string;
  apiReplicas: number;
  workerReplicas: number;
}
export interface DeploymentIO {
  docker(args: readonly string[], env: NodeJS.ProcessEnv): Promise<string>;
  verify(origin: string, manifest: ReleaseManifest): Promise<void>;
}
export interface DeploymentOptions { rollback?: boolean; expectedActiveSha?: string }
export function readDeployConfig(env: NodeJS.ProcessEnv): DeployConfig {
  const environment = env.DEPLOYMENT_ENV;
  if (environment !== 'staging' && environment !== 'production') throw new Error('DEPLOYMENT_ENV must be staging or production.');
  const root = env.DEPLOYMENT_ROOT;
  const envFile = env.DEPLOYMENT_ENV_FILE;
  const host = env.DEPLOYMENT_HOST;
  if (!root || !envFile || !host || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host)) throw new Error('Deployment root, private env file and public hostname are required.');
  const count = (value: string | undefined) => {
    const result = Number(value ?? '1');
    if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error('Replica counts must be 1..20.');
    return result;
  };
  return { environment, root, envFile, host, apiReplicas: count(env.API_REPLICAS), workerReplicas: count(env.WORKER_REPLICAS) };
}
export function proxyConfig(host: string, slot: DeploymentState['slot']): string {
  if (!/^[a-z0-9.-]+$/.test(host) || (slot !== 'blue' && slot !== 'green')) throw new Error('Invalid proxy target.');
  return `${host} {
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  @api path /api/* /health /ready /release /metrics
  handle @api {
    reverse_proxy {
      dynamic a api-${slot} 3001 {
        refresh 5s
      }
      header_up X-Forwarded-Proto https
      fail_duration 10s
      unhealthy_status 503
      lb_policy round_robin
    }
  }
  handle {
    reverse_proxy {
      dynamic a web-${slot} 3000 {
        refresh 5s
      }
      lb_policy round_robin
    }
  }
}
`;
}

export async function verifyRelease(origin: string, manifest: ReleaseManifest): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      for (const path of ['/release', '/release-info']) {
        const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5_000), cache: 'no-store', redirect: 'error' });
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== 'object' || !('gitSha' in body) || body.gitSha !== manifest.gitSha) throw new Error('Release identity mismatch.');
      }
      if (!(await fetch(`${origin}/ready`, { signal: AbortSignal.timeout(5_000), cache: 'no-store', redirect: 'error' })).ok) throw new Error('Release is not ready.');
      return;
    } catch { await pause(2_000); }
  }
  throw new Error('HTTPS release verification failed.');
}
const defaultIO: DeploymentIO = { docker: (args, env) => command('docker', args, env), verify: verifyRelease };

export async function deployRelease(config: DeployConfig, manifest: ReleaseManifest, options: DeploymentOptions = {}, io: DeploymentIO = defaultIO): Promise<void> {
  const rollback = options.rollback ?? false;
  await requirePrivateEnv(config.envFile);
  const privateEnv = parseEnv(await readFile(config.envFile, 'utf8'));
  if (privateEnv.APP_URL !== `https://${config.host}` || !/^caddy(?:[:/][a-z0-9./:_-]+)?@sha256:[a-f0-9]{64}$/.test(privateEnv.PROXY_IMAGE ?? '')) throw new Error('Environment origin and digest-pinned Caddy image must match the deployment.');
  const releaseLock = await acquireDeploymentLock(config.root);
  try {
    const bindingFile = join(config.root, 'environment.json');
    const binding = JSON.stringify({ environment: config.environment, host: config.host, envFile: config.envFile });
    try { await writeFile(bindingFile, binding, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      if (await readFile(bindingFile, 'utf8') !== binding) throw new Error('Deployment state belongs to another environment or origin.');
    }
    const active = await readState(config.root, 'active.json');
    if (options.expectedActiveSha && active?.manifest.gitSha !== options.expectedActiveSha) throw new Error('Active release changed while scaling; retry with a fresh sample.');
    let database = active?.manifest;
    try { database = parseManifest(JSON.parse(await readFile(join(config.root, 'database.json'), 'utf8')) as unknown); }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
    const sameRelease = active?.manifest.gitSha === manifest.gitSha;
    if (sameRelease && active) {
      if (JSON.stringify(active.manifest.images) !== JSON.stringify(manifest.images)) throw new Error('A commit cannot be redeployed with different image digests.');
    }
    if (active && !sameRelease) assertCompatible(active.manifest, manifest, rollback);
    if (active && (active.manifest.apiContractVersion !== manifest.apiContractVersion || active.manifest.eventSchemaVersion !== manifest.eventSchemaVersion
      || active.manifest.featureFlagVersion !== manifest.featureFlagVersion)) throw new Error('Protocol changes require a separate reviewed rollout; automatic rollback must remain compatible.');
    if (database && !sameRelease) assertCompatible(database, manifest, rollback);
    if (rollback && !active) throw new Error('No active release to roll back.');
    const candidate: DeploymentState = { slot: sameRelease && active ? active.slot : active?.slot === 'blue' ? 'green' : 'blue', manifest };
    if (!sameRelease && !rollback) await snapshotDefinition(config.root, manifest.gitSha);
    const network = `axon-${config.environment}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AXON_ENV_FILE: config.envFile, DEPLOYMENT_ENV: config.environment,
      RELEASE_VERSION: manifest.version, RELEASE_GIT_SHA: manifest.gitSha,
      RELEASE_MIGRATION_VERSION: manifest.migrationVersion,
      BACKEND_IMAGE: manifest.images.backend, WEB_IMAGE: manifest.images.web, MIGRATOR_IMAGE: manifest.images.migrator,
      RELEASE_SLOT: candidate.slot, DEPLOYMENT_NETWORK: network, DEPLOYMENT_ROOT: config.root,
      REQUIRE_EMPTY_DATABASE: database ? 'false' : 'true',
    };
    const definition = (state: DeploymentState, file: string) => join(config.root, 'definitions', state.manifest.gitSha, file);
    const compose = (state: DeploymentState, args: readonly string[]) => io.docker(['compose', '--env-file', config.envFile, '-f', definition(state, 'compose.yml'), '-p', `axon-${config.environment}-${state.slot}`, ...args], {
      ...env, RELEASE_SLOT: state.slot, RELEASE_GIT_SHA: state.manifest.gitSha, RELEASE_VERSION: state.manifest.version,
      RELEASE_MIGRATION_VERSION: state.manifest.migrationVersion,
      BACKEND_IMAGE: state.manifest.images.backend, WEB_IMAGE: state.manifest.images.web, MIGRATOR_IMAGE: state.manifest.images.migrator,
    });
    const edge = (args: readonly string[], state = candidate) => io.docker(['compose', '--env-file', config.envFile, '-f', definition(state, 'edge.compose.yml'), '-p', `axon-${config.environment}-edge`, ...args], env);
    const proxyDirectory = join(config.root, 'proxy');
    await mkdir(proxyDirectory, { recursive: true, mode: 0o700 });
    try { await io.docker(['network', 'inspect', network], env); }
    catch { await io.docker(['network', 'create', network], env); }
    await compose(candidate, ['config', '--quiet']);
    await compose(candidate, ['pull', 'backend', 'web', 'worker', 'migrate']);
    for (const image of Object.values(manifest.images)) {
      const labels: unknown = JSON.parse(await io.docker(['image', 'inspect', '--format', '{{json .Config.Labels}}', image], env));
      if (!labels || typeof labels !== 'object' || !('org.opencontainers.image.revision' in labels) || !('org.opencontainers.image.version' in labels)
        || labels['org.opencontainers.image.revision'] !== manifest.gitSha || labels['org.opencontainers.image.version'] !== manifest.version) throw new Error('Image provenance does not match the release manifest.');
    }
    if (sameRelease && active) {
      await compose(active, ['up', '--detach', '--wait', '--wait-timeout', '180', '--scale', `backend=${config.apiReplicas}`, '--scale', `worker=${config.workerReplicas}`, 'backend', 'web', 'worker']);
      await io.verify(`https://${config.host}`, manifest);
      return;
    }
    try {
      if (active) await compose(active, ['stop', '--timeout', '390', 'worker']);
      if (!rollback) {
        await compose(candidate, ['run', '--rm', '--no-deps', 'migrate']);
        await atomicWrite(join(config.root, 'database.json'), JSON.stringify(manifest));
      }
      await compose(candidate, ['up', '--detach', '--wait', '--wait-timeout', '180', '--scale', `backend=${config.apiReplicas}`, '--scale', `worker=${config.workerReplicas}`, 'backend', 'web', 'worker']);
      await atomicWrite(join(proxyDirectory, 'Caddyfile'), proxyConfig(config.host, candidate.slot));
      await edge(['up', '--detach', '--wait', '--wait-timeout', '60']);
      await edge(['exec', '-T', 'proxy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']);
      await io.verify(`https://${config.host}`, manifest);
      const releaseDirectory = join(config.root, 'releases');
      await mkdir(releaseDirectory, { recursive: true, mode: 0o700 });
      await writeFile(join(releaseDirectory, `${manifest.gitSha}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 }).catch(async (error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
        if (await readFile(join(releaseDirectory, `${manifest.gitSha}.json`), 'utf8') !== `${JSON.stringify(manifest, null, 2)}\n`) throw new Error('Stored release manifest is immutable.');
      });
      if (active) await compose(active, ['stop', '--timeout', '390', 'backend', 'web']);
      if (active) await atomicWrite(join(config.root, 'previous.json'), JSON.stringify(active));
      await atomicWrite(join(config.root, 'active.json'), JSON.stringify(candidate));
    } catch (error) {
      try {
        if (active) {
          await compose(active, ['up', '--detach', '--wait', '--wait-timeout', '180', 'backend', 'web', 'worker']);
          await atomicWrite(join(proxyDirectory, 'Caddyfile'), proxyConfig(config.host, active.slot));
          await edge(['exec', '-T', 'proxy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], active);
          await io.verify(`https://${config.host}`, active.manifest);
        }
      } finally { await compose(candidate, ['stop', '--timeout', '390', 'backend', 'web', 'worker']); }
      throw error;
    }
  } finally { await releaseLock(); }
}
