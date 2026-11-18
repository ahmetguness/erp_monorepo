import { PrismaClient } from '@prisma/client';

export async function isolatedDatabase(): Promise<PrismaClient> {
  const value = process.env.PERFORMANCE_DATABASE_URL;
  const url = new URL(value ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^phase8_[a-z0-9_]+_ci$/.test(url.pathname.slice(1)) || (url.searchParams.get('schema') ?? 'public') !== 'public') throw new Error('An explicit isolated phase8_*_ci database is required.');
  const db = new PrismaClient({ datasources: { db: { url: url.href } }, log: [] });
  const [identity] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (identity?.name !== url.pathname.slice(1)) { await db.$disconnect(); throw new Error('Performance database identity mismatch.'); }
  return db;
}
