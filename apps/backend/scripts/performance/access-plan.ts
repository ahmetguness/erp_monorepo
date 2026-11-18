import { readFile } from 'node:fs/promises';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userAccessSnapshotSQL } from '../../src/modules/identity/infrastructure/user-access-snapshot.query.js';

export async function explainAccessSnapshot(db: PrismaClient) {
  const fixture = z.object({ actors: z.array(z.object({ userId: z.string(), tenantId: z.string() })).nonempty() })
    .parse(JSON.parse(await readFile(process.env.PERF_FIXTURE_FILE ?? '/tmp/performance-fixture.json', 'utf8')) as unknown);
  const actor = fixture.actors[0];
  const query = userAccessSnapshotSQL(actor.userId, actor.tenantId, new Date());
  const plan = await db.$queryRaw<unknown[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
  return { qualification: 'Actual user access statement, synthetic fixture, guarded disposable DB only.', statement: query.text, plan };
}
