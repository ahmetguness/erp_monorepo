import type { Prisma } from '@prisma/client';

/** All allocation, reversal and cancellation writers acquire these in sorted order. */
export async function lockInvoiceMutations(tx: Prisma.TransactionClient, tenantId: string, invoiceIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(invoiceIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${id}`}))`;
  }
}
