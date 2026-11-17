import { PrismaClient } from '@prisma/client';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyForwardFix } from './forward-fix-assurance.js';

async function cli(args: readonly string[], databaseUrl: string): Promise<void> {
  const resolver = createRequire(resolve(process.cwd(), 'package.json'));
  const schema = args.find((argument) => argument.startsWith('--schema='))?.slice('--schema='.length);
  // The repository config pins migrations.path. Baseline/fixture schemas must
  // run outside it so --schema selects their own immutable migration history.
  const cwd = schema && isAbsolute(schema) ? dirname(schema) : process.cwd();
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [resolver.resolve('prisma/build/index.js'), ...args], {
      env: { ...process.env, DATABASE_URL: databaseUrl }, cwd, stdio: 'inherit', windowsHide: true, signal: AbortSignal.timeout(10 * 60_000),
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? done() : reject(new Error(`Migration assurance failed with exit ${code}.`)));
  });
}

async function main(): Promise<void> {
  const baseUrl = new URL(process.env.MIGRATION_ASSURANCE_DATABASE_URL ?? '');
  if (!/^phase7_[a-z0-9_]+_ci$/.test(baseUrl.pathname.slice(1)) || (baseUrl.searchParams.get('schema') ?? 'public') !== 'public') throw new Error('An explicit isolated phase7_*_ci database is required.');
  const baseline = process.env.BASELINE_GIT_SHA;
  if (!baseline || !/^[a-f0-9]{40}$/.test(baseline)) throw new Error('BASELINE_GIT_SHA must identify the previous release.');
  const temporary = await mkdtemp(join(tmpdir(), 'axon-migration-assurance-'));
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl.href } } });
  const created: string[] = [];
  const clients: PrismaClient[] = [];
  try {
    const prefix = `phase7_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const database = async (suffix: string) => {
      const name = `${prefix}_${suffix}_ci`;
      if (!/^phase7_[a-z0-9_]+_ci$/.test(name)) throw new Error('Unsafe test database identifier.');
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created.push(name);
      const url = new URL(baseUrl); url.pathname = `/${name}`;
      return url.href;
    };
    const emptyUrl = await database('empty'); const upgradeUrl = await database('upgrade');
    const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', 'apps/backend/prisma/schema'], { cwd: repository, encoding: 'utf8' }).trim().split('\n');
    const oldSchema = join(temporary, 'schema');
    for (const file of files) {
      if (!/^apps\/backend\/prisma\/schema\/[a-zA-Z0-9_./-]+$/.test(file) || file.includes('..')) throw new Error('Invalid baseline schema path.');
      const output = join(oldSchema, file.slice('apps/backend/prisma/schema/'.length));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, execFileSync('git', ['show', `${baseline}:${file}`], { cwd: repository }));
    }
    await cli(['migrate', 'deploy', '--schema=prisma/schema'], emptyUrl);
    await cli(['migrate', 'deploy', `--schema=${oldSchema}`], upgradeUrl);
    const upgraded = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); clients.push(upgraded);
    const expectedHistory = files.flatMap((file) => {
      const match = /^apps\/backend\/prisma\/schema\/migrations\/([^/]+)\/migration\.sql$/.exec(file);
      return match ? [match[1]] : [];
    }).sort();
    const applied = await upgraded.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name
    `;
    if (!expectedHistory.length || JSON.stringify(applied.map((row) => row.migration_name)) !== JSON.stringify(expectedHistory)) throw new Error('Applied baseline history does not match the requested release.');
    const fixture = `phase7-${randomUUID()}`;
    await upgraded.$executeRaw`INSERT INTO tenants (id, slug, "companyName", email, "updatedAt") VALUES (${fixture}, ${fixture}, 'Synthetic migration assurance', 'migration@example.test', NOW())`;
    await cli(['migrate', 'deploy', '--schema=prisma/schema'], upgradeUrl);
    const [preserved] = await upgraded.$queryRaw<Array<{ companyName: string; email: string }>>`SELECT "companyName", email FROM tenants WHERE id = ${fixture}`;
    if (preserved?.companyName !== 'Synthetic migration assurance' || preserved.email !== 'migration@example.test') throw new Error('Upgrade changed the synthetic business record.');
    for (const url of [emptyUrl, upgradeUrl]) {
      await cli(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema', '--exit-code'], url);
    }
    await verifyForwardFix(upgraded, upgradeUrl, temporary, fixture, cli);
    console.info(JSON.stringify({ emptyInstall: 'passed', upgrade: 'passed', forwardFix: 'passed', dataPreserved: true, drift: 'none', baseline }));
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
    for (const name of created.reverse()) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    if (!/^axon-migration-assurance-[^/\\]+$/.test(relative(resolve(tmpdir()), resolve(temporary)))) throw new Error('Unsafe temporary path.');
    await rm(temporary, { recursive: true });
  }
}
void main().catch(() => { console.error('Release migration assurance failed. See the preceding migration output.'); process.exitCode = 1; });
