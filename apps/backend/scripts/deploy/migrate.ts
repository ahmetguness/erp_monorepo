import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

async function migrate(databaseUrl: string): Promise<void> {
  const requireModule = createRequire(resolve(process.cwd(), 'package.json'));
  const cli = requireModule.resolve('prisma/build/index.js');
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--schema=prisma/schema'], {
      env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit',
      signal: AbortSignal.timeout(25 * 60_000), windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? done() : reject(new Error('Migration command failed.')));
  });
}

export async function deployMigrations(): Promise<void> {
  const target = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(target.protocol) || target.searchParams.get('pgbouncer') === 'true') {
    throw new Error('MIGRATION_DATABASE_URL must use a direct PostgreSQL connection.');
  }
  target.searchParams.set('connection_limit', '1');
  target.searchParams.set('pool_timeout', '10');
  const db = new PrismaClient({ datasources: { db: { url: target.href } } });
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const migrated = await db.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ owned: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtextextended('axon:release:migration:v1', 0)) AS owned
        `;
        if (!lock?.owned) return false;
        if (process.env.REQUIRE_EMPTY_DATABASE === 'true') {
          const [{ exists }] = await tx.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') AS exists
          `;
          if (exists) throw new Error('First managed deployment requires an empty database or an imported release baseline.');
        }
        await migrate(target.href);
        return true;
      }, { maxWait: 10_000, timeout: 26 * 60_000 });
      if (migrated) return;
      await pause(1_000);
    }
    throw new Error('Another deployment owns the migration lock.');
  } finally { await db.$disconnect(); }
}

if (require.main === module) {
  void deployMigrations().catch(() => { console.error('Migration deployment failed; inspect migration logs before retrying.'); process.exitCode = 1; });
}
