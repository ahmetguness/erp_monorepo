import { writeFile } from 'node:fs/promises';
import { isolatedDatabase } from './database.js';
import { seedPerformance } from './seed.js';
import { databaseTelemetry } from './telemetry.js';
import { checkInvariants } from './invariants.js';
import { verifyPlanQuotas } from './quota.js';
import { explainAccessSnapshot } from './access-plan.js';

async function main(): Promise<void> {
  const db = await isolatedDatabase();
  try {
    const action = process.argv[2];
    if (action === 'seed') {
      await db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
      await writeFile(process.env.PERF_FIXTURE_FILE ?? '/tmp/performance-fixture.json', JSON.stringify(await seedPerformance(db)), { mode: 0o600 });
      console.info('Synthetic performance fixture created.');
    } else if (action === 'snapshot') console.info(JSON.stringify(await databaseTelemetry(db)));
    else if (action === 'explain-access') console.info(JSON.stringify(await explainAccessSnapshot(db)));
    else if (action === 'invariants' || action === 'quota') {
      const result = action === 'quota' ? await verifyPlanQuotas(db) : await checkInvariants(db);
      console.info(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
    } else throw new Error('Expected seed, snapshot, invariants or quota.');
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL]') : 'Unknown error';
  console.error(`Isolated performance database operation failed: ${message}`); process.exitCode = 1;
});
