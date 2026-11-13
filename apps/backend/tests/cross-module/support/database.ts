import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeEach } from 'vitest';

export const db = new PrismaClient();

async function resetIsolatedDatabase(): Promise<void> {
  const expected = new URL(process.env.CROSS_MODULE_DATABASE_URL ?? '').pathname.slice(1);
  const [identity] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (!/^phase3_[a-z0-9_]+_ci$/.test(expected) || identity?.name !== expected) {
    throw new Error('Refusing cleanup outside the explicitly selected cross-module test database.');
  }
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length) {
    const identifiers = tables.map(({ tablename }) => Prisma.raw(`"public"."${tablename.replaceAll('"', '""')}"`));
    await db.$executeRaw(Prisma.sql`TRUNCATE TABLE ${Prisma.join(identifiers)} RESTART IDENTITY CASCADE`);
  }
}

// Serial files and cases own the whole disposable database. Reset also runs
// after failures; immutable financial/audit rows cannot obstruct fixture cleanup.
export function isolatedDatabase(): void {
  beforeEach(resetIsolatedDatabase);
  afterEach(resetIsolatedDatabase);
  afterAll(async () => {
    await db.$disconnect();
    const { prisma } = await import('../../../src/lib/prisma.js');
    await prisma.$disconnect();
  });
}
