import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { seedPerformance } from '../performance/seed.js';
import { createPlatformAudit } from '../../src/modules/platform/platform-audit/platform-audit.service.js';
import { prisma } from '../../src/lib/prisma.js';
async function main(): Promise<void> {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (target.pathname !== '/phase3_dr_ci' || !/^axon-dr-[a-f0-9]{12}$/.test(process.env.DR_OWNER ?? ''))
    throw new Error('Owned observability fixture required');
  const db = new PrismaClient();
  try {
    const rows = await db.$queryRaw<Array<{
      owner: string;
    }>> `SELECT owner FROM axon_dr.identity`;
    if (rows.length !== 1 || rows[0]?.owner !== process.env.DR_OWNER)
      throw new Error('Fixture database ownership mismatch');
    const fixture = await seedPerformance(db);
    for (const actor of fixture.actors) {
      await db.tenantSetting.create({ data: { tenantId: actor.tenantId, key: 'wizard_completed', value: 'true' } });
      await db.product.update({ where: { id: actor.productId }, data: { name: `Phase10 ${actor.plan} exclusive product` } });
    }
    await createPlatformAudit({ actorId: null, action: 'UPDATE', module: 'OBSERVABILITY_DRILL', targetType: 'synthetic', targetId: null, outcome: 'SUCCESS' });
    if (!process.env.OBSERVABILITY_FIXTURE_FILE)
      throw new Error('Private fixture path required');
    await writeFile(process.env.OBSERVABILITY_FIXTURE_FILE, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
  }
  finally {
    await db.$disconnect();
    await prisma.$disconnect();
  }
}
main().catch(() => { console.error('Owned observability fixture creation failed'); process.exitCode = 1; });
