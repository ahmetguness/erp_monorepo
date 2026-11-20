import type { Prisma, PrismaClient } from '@prisma/client';
export type SessionDatabase = Pick<PrismaClient, '$transaction' | 'tenantSetting'>;
export async function lockSessionRegistry(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':security-sessions'}, 0))`;
}

/** The session registry is one JSON row per tenant; every writer must serialize its read/modify/write. */
export function withSessionRegistryLock<T>(db: Pick<PrismaClient, '$transaction'>, tenantId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockSessionRegistry(tx, tenantId);
    return operation(tx);
  });
}
