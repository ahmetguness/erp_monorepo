import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { assertCompatible, parseManifest, type ReleaseManifest } from '../manifest.js';
import { acquireDeploymentLock, readState, snapshotDefinition } from '../state.js';
import { deployRelease, proxyConfig, type DeploymentIO } from '../deploy.js';
import { chooseReplicas } from '../autoscale.js';
import { execFileSync } from 'node:child_process';
import { validateReleaseSource } from '../source.js';
import { requiresContractReview } from '../migration-policy.js';
import { command } from '../process.js';

function manifest(sha: string, extra = false): ReleaseManifest {
  return parseManifest({
    schemaVersion: 1, version: '1.0.0', gitSha: sha.repeat(40), createdAt: '2026-11-17T00:00:00.000Z',
    images: { backend: `ghcr.io/test/api@sha256:${sha.repeat(64)}`, web: `ghcr.io/test/web@sha256:${sha.repeat(64)}`, migrator: `ghcr.io/test/migrator@sha256:${sha.repeat(64)}` },
    apiContractVersion: 1, minimumApiContractVersion: 1, eventSchemaVersion: 2, minimumEventSchemaVersion: 1, featureFlagVersion: 1,
    migrations: [{ id: '20261116120000_initial', checksum: 'a'.repeat(64), destructive: false }, ...(extra ? [{ id: '20261117120000_additive', checksum: 'b'.repeat(64), destructive: false }] : [])],
    migrationVersion: extra ? '20261117120000_additive' : '20261116120000_initial',
    rollback: { strategy: 'application-only', database: 'forward-fix', requiresCompatibleSchema: true },
  });
}
test('manifests reject mutable tags, malformed versions and invalid protocol ranges', () => {
  const valid = manifest('a');
  assert.throws(() => parseManifest({ ...valid, images: { ...valid.images, web: 'image:latest' } }));
  assert.throws(() => parseManifest({ ...valid, version: 'main' }));
  assert.throws(() => parseManifest({ ...valid, minimumEventSchemaVersion: 9 }));
});
test('expand releases preserve history; contract migrations, tampering and unsafe rollback are blocked', () => {
  const before = manifest('a'); const after = manifest('b', true);
  assert.doesNotThrow(() => assertCompatible(before, after));
  assert.doesNotThrow(() => assertCompatible(after, before, true));
  assert.throws(() => assertCompatible(before, { ...after, migrations: [{ ...after.migrations[0], checksum: 'f'.repeat(64) }, after.migrations[1]] }));
  assert.throws(() => assertCompatible(before, { ...after, migrations: [after.migrations[0], { ...after.migrations[1], destructive: true }] }));
  assert.throws(() => assertCompatible({ ...after, eventSchemaVersion: 3 }, before, true));
});
test('proxy configuration isolates slots and enforces HTTPS forwarding', () => {
  assert.match(proxyConfig('staging.example.com', 'green'), /dynamic a api-green 3001/);
  assert.match(proxyConfig('staging.example.com', 'green'), /X-Forwarded-Proto https/);
  assert.throws(() => proxyConfig('host { respond hacked }', 'blue'));
});

async function fixture(operation: (root: string, envFile: string) => Promise<void>): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), 'axon-release-test-'));
  try {
    const root = join(temporary, 'state');
    const envFile = join(temporary, 'runtime.env');
    await writeFile(envFile, `APP_URL=https://staging.example.com\nPROXY_IMAGE=caddy@sha256:${'a'.repeat(64)}\n`, { mode: 0o600 });
    await mkdir(root);
    await operation(root, envFile);
  } finally {
    const resolved = resolve(temporary);
    assert.match(relative(resolve(tmpdir()), resolved), /^axon-release-test-[^/\\]+$/);
    await rm(resolved, { recursive: true });
  }
}
test('a concurrent deployment cannot acquire the environment lock', async () => fixture(async (root) => {
  const release = await acquireDeploymentLock(root);
  await assert.rejects(acquireDeploymentLock(root));
  await release();
  await (await acquireDeploymentLock(root))();
}));

test('a failed first deployment retries against its recorded migrated schema without an empty database requirement', async () => fixture(async (root, envFile) => {
  const target = manifest('a');
  await writeFile(join(root, 'database.json'), JSON.stringify(target));
  let migrationGuard: string | undefined;
  const io: DeploymentIO = {
    docker: async (args, env) => {
      if (args.includes('run')) migrationGuard = env.REQUIRE_EMPTY_DATABASE;
      if (args[0] === 'image') return JSON.stringify({ 'org.opencontainers.image.revision': target.gitSha, 'org.opencontainers.image.version': target.version });
      return '';
    },
    verify: async () => {},
  };
  await deployRelease({ environment: 'staging', root, envFile, host: 'staging.example.com', apiReplicas: 1, workerReplicas: 1 }, target, {}, io);
  assert.equal(migrationGuard, 'false');
  assert.equal((await readState(root, 'active.json'))?.manifest.gitSha, target.gitSha);
}));

for (const scenario of ['success', 'migration-error', 'verification-error', 'rollback', 'same-release-scale'] as const) {
  test(`deployment ${scenario} preserves a recoverable application and database state`, async () => fixture(async (root, envFile) => {
    const old = manifest('a'); const next = manifest('b', true);
    const active = scenario === 'rollback' ? next : old;
    const target = scenario === 'rollback' || scenario === 'same-release-scale' ? old : next;
    await snapshotDefinition(root, active.gitSha);
    if (scenario === 'rollback') await snapshotDefinition(root, target.gitSha);
    await writeFile(join(root, 'active.json'), JSON.stringify({ slot: 'blue', manifest: active }));
    await writeFile(join(root, 'database.json'), JSON.stringify(active));
    const calls: string[] = [];
    const verified: string[] = [];
    const io: DeploymentIO = {
      docker: async (args) => {
        calls.push(args.join(' '));
        if (args[0] === 'image') return JSON.stringify({ 'org.opencontainers.image.revision': target.gitSha, 'org.opencontainers.image.version': target.version });
        if (scenario === 'migration-error' && args.includes('run')) throw new Error('Injected migration failure.');
        return '';
      },
      verify: async (_origin, release) => {
        verified.push(release.gitSha);
        if (scenario === 'verification-error' && release.gitSha === target.gitSha) throw new Error('Injected readiness failure.');
      },
    };
    const deploy = () => deployRelease({ environment: 'staging', root, envFile, host: 'staging.example.com', apiReplicas: 2, workerReplicas: 3 }, target, { rollback: scenario === 'rollback' }, io);
    if (scenario.endsWith('error')) await assert.rejects(deploy()); else await deploy();
    assert.equal((await readState(root, 'active.json'))?.manifest.gitSha, scenario.endsWith('error') ? active.gitSha : target.gitSha);
    if (scenario === 'verification-error') {
      assert.equal(verified.at(-1), active.gitSha);
      const database: unknown = JSON.parse(await readFile(join(root, 'database.json'), 'utf8'));
      assert.equal(parseManifest(database).gitSha, next.gitSha);
    }
    if (scenario === 'rollback' || scenario === 'same-release-scale') assert.ok(!calls.some((call) => call.includes('run --rm')));
    if (scenario === 'success' || scenario === 'same-release-scale') assert.ok(calls.some((call) => call.includes('--scale backend=2 --scale worker=3')));
    assert.ok(!calls.some((call) => /down -v|volume rm|db:seed/.test(call)));
  }));
}

test('API and worker scaling policies bound increases and only decrease one replica at a time', () => {
  const policy = { minimum: 2, maximum: 5, targetCpu: 70 };
  assert.equal(chooseReplicas(2, 180, policy), 5);
  assert.equal(chooseReplicas(5, 10, policy), 4);
  assert.equal(chooseReplicas(2, 10, policy), 2);
  assert.equal(chooseReplicas(3, 70, policy), 3);
  assert.equal(chooseReplicas(20, 10, policy), 5);
  assert.equal(chooseReplicas(1, 10, policy), 2);
  assert.throws(() => chooseReplicas(2, NaN, policy));
});

for (const action of ['scale', 'rollback'] as const) {
  test(`a stale ${action} cannot replace a concurrently deployed release`, async () => fixture(async (root, envFile) => {
    const requested = manifest('a'); const current = manifest('b');
    await writeFile(join(root, 'active.json'), JSON.stringify({ slot: 'green', manifest: current }));
    let dockerCalls = 0;
    await assert.rejects(deployRelease({ environment: 'staging', root, envFile, host: 'staging.example.com', apiReplicas: 1, workerReplicas: 1 }, requested,
      { rollback: action === 'rollback', expectedActiveSha: requested.gitSha }, {
        docker: async () => { dockerCalls++; return ''; }, verify: async () => {},
      }), /Active release changed/);
    assert.equal(dockerCalls, 0);
    assert.equal((await readState(root, 'active.json'))?.manifest.gitSha, current.gitSha);
  }));
}

for (const change of ['unstaged', 'staged', 'untracked'] as const) {
  test(`release source validation rejects ${change} deployment changes`, async () => fixture(async (root) => {
    const git = (args: readonly string[]) => execFileSync('git', [...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    await mkdir(join(root, 'deploy'));
    const definition = join(root, 'deploy', 'compose.yml');
    await writeFile(definition, 'services: {}\n');
    git(['init']); git(['add', 'deploy']);
    git(['-c', 'user.name=Release QA', '-c', 'user.email=release@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic release source']);
    const sha = git(['rev-parse', 'HEAD']);
    const run = async (args: readonly string[]) => git(args);
    await validateReleaseSource(sha, run);
    await writeFile(change === 'untracked' ? join(root, 'deploy', 'extra.yml') : definition, 'services: { changed: {} }\n');
    if (change === 'staged') git(['add', 'deploy']);
    await assert.rejects(validateReleaseSource(sha, run));
  }));
}

test('contract screening blocks renames, constraint removals and destructive SQL after quoted comment markers', () => {
  for (const sql of [
    'ALTER TABLE tenants RENAME COLUMN email TO contact_email;',
    'ALTER TABLE tenants DROP CONSTRAINT tenant_fk;',
    'DROP INDEX tenant_guard;',
    "SELECT '--'; DROP TABLE tenants;",
    'ALTER TABLE tenants ALTER COLUMN email TYPE bytea;',
  ]) assert.equal(requiresContractReview(sql), true, sql);
  assert.equal(requiresContractReview('ALTER TABLE tenants ADD COLUMN extra_info TEXT;'), false);
});

test('release commands wait for complete piped output and reject nonzero exits', async () => {
  assert.equal((await command(process.execPath, ['-e', "process.stdout.write('x'.repeat(500000),()=>process.exit(0))"])).length, 500_000);
  await assert.rejects(command(process.execPath, ['-e', 'process.exit(7)']), /exit code 7/);
});
