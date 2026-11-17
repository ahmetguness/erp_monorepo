import type { PrismaClient } from '@prisma/client';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type MigrationCLI = (args: readonly string[], databaseUrl: string) => Promise<void>;

/** Called only on the disposable upgrade database owned by verify-migrations. */
export async function verifyForwardFix(db: PrismaClient, databaseUrl: string, temporary: string, fixture: string, cli: MigrationCLI): Promise<void> {
  const schema = join(temporary, 'forward-schema');
  await cp(resolve('prisma/schema'), schema, { recursive: true });
  const identity = join(schema, 'identity.prisma');
  const source = await readFile(identity, 'utf8');
  if (!source.includes('model Tenant {')) throw new Error('Forward-fix fixture requires the tenant schema.');
  await writeFile(identity, source.replace('model Tenant {', 'model Tenant {\n  phase7ForwardFix String?'));
  const brokenId = '20990101000000_phase7_forward_fix_failure';
  const failureFile = join(schema, 'migrations', brokenId, 'migration.sql');
  await mkdir(join(schema, 'migrations', brokenId));
  const brokenSQL = 'ALTER TABLE tenants ADD COLUMN "phase7ForwardFix" TEXT;\nSELECT 1 / 0;\n';
  await writeFile(failureFile, brokenSQL);
  console.info('Forward-fix assurance: expecting a controlled migration failure in the disposable upgrade database.');
  let rejected = false;
  try { await cli(['migrate', 'deploy', `--schema=${schema}`], databaseUrl); }
  catch { rejected = true; }
  const [failure] = await db.$queryRaw<Array<{ failed: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name = ${brokenId}
      AND finished_at IS NULL AND rolled_back_at IS NULL AND logs LIKE '%division by zero%') AS failed
  `;
  if (!rejected || !failure?.failed) throw new Error('Expected controlled migration failure was not recorded.');

  // Rehearse an operator inspecting and completing the intended additive DDL.
  // Never resolve a real migration before verifying its actual database state.
  await db.$executeRaw`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "phase7ForwardFix" TEXT`;
  const [column] = await db.$queryRaw<Array<{ data_type: string; is_nullable: string }>>`
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'phase7ForwardFix'
  `;
  if (column?.data_type !== 'text' || column.is_nullable !== 'YES') throw new Error('Repair did not produce the intended additive schema.');
  await cli(['migrate', 'resolve', '--applied', brokenId, `--schema=${schema}`], databaseUrl);
  const correction = join(schema, 'migrations', '20990101000001_phase7_forward_fix_backfill');
  await mkdir(correction);
  await writeFile(join(correction, 'migration.sql'), 'UPDATE tenants SET "phase7ForwardFix" = \'repaired\';\n');
  await cli(['migrate', 'deploy', `--schema=${schema}`], databaseUrl);
  const [preserved] = await db.$queryRaw<Array<{ companyName: string; email: string; phase7ForwardFix: string }>>`
    SELECT "companyName", email, "phase7ForwardFix" FROM tenants WHERE id = ${fixture}
  `;
  if (preserved?.companyName !== 'Synthetic migration assurance' || preserved.email !== 'migration@example.test' || preserved.phase7ForwardFix !== 'repaired') throw new Error('Forward-fix did not preserve the synthetic business record.');
  if (await readFile(failureFile, 'utf8') !== brokenSQL) throw new Error('Forward-fix changed migration history.');
  await cli(['migrate', 'diff', '--from-url', databaseUrl, '--to-schema-datamodel', schema, '--exit-code'], databaseUrl);
}
