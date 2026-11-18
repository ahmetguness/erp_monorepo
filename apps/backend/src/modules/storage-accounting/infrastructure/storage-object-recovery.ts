import type { PrismaClient } from "@prisma/client";
import { logger } from "../../../lib/logger.js";
import {
  runWithTenantIsolationBypass,
  runWithTenantScope,
} from "../../../lib/tenant-isolation-context.js";
import type { ObjectStorage } from "../../shared/index.js";

const TERMINAL = ["REJECTED", "EXPIRED", "CANCELLED"] as const;
export const MAX_STORAGE_CLEANUP_ATTEMPTS = 5;
/** Persisted bounded cleanup. Claim lease survives a process exit, including after provider delete. */
export async function recoverStorageObjects(
  db: PrismaClient,
  storage: ObjectStorage,
  deadline = Date.now() + 30_000,
): Promise<number> {
  const rows = await runWithTenantIsolationBypass(
    "storage-reservation-worker-expiry",
    () =>
      db.storageReservation.findMany({
        where: {
          status: { in: [...TERMINAL] },
          cleanupAfter: { lte: new Date() },
          cleanupAttempts: { lt: MAX_STORAGE_CLEANUP_ATTEMPTS },
        },
        orderBy: [{ cleanupAfter: "asc" }, { id: "asc" }],
        take: 25,
      }),
  );
  let removed = 0;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    await runWithTenantScope(row.tenantId, async () => {
      const claimed = await db.storageReservation.updateMany({
        where: {
          id: row.id,
          tenantId: row.tenantId,
          status: { in: [...TERMINAL] },
          cleanupAfter: { lte: new Date() },
          cleanupAttempts: row.cleanupAttempts,
        },
        data: {
          cleanupAttempts: { increment: 1 },
          cleanupAfter: new Date(Date.now() + 60_000),
        },
      });
      if (claimed.count !== 1) return;
      try {
        await storage.delete(row.objectKey);
        await db.storageReservation.updateMany({
          where: {
            id: row.id,
            tenantId: row.tenantId,
            status: { in: [...TERMINAL] },
            cleanupAttempts: row.cleanupAttempts + 1,
          },
          data: { cleanupAfter: null, cleanupCompletedAt: new Date() },
        });
        removed++;
      } catch {
        logger.warn("[StorageCleanup] Deferred object cleanup failed", {
          attempt: row.cleanupAttempts + 1,
          exhausted: row.cleanupAttempts + 1 >= MAX_STORAGE_CLEANUP_ATTEMPTS,
        });
      }
    });
  }
  return removed;
}
