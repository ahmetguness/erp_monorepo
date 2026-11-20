import { Prisma, type PrismaClient } from "@prisma/client";
import { ConflictError } from "../errors/index.js";
import { countTelemetry } from './telemetry/metrics.js';

/** Callback must contain database work only: serialization may re-execute it. */
export async function serializableTransaction<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts: 3 | 5 = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      countTelemetry('axon_transaction_failures_total');
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (error.code === "P2010" && error.meta?.code === "40001"));
      if (!retryable) throw error;
      if (attempt === maxAttempts - 1)
        throw new ConflictError("Concurrent modification; refresh and retry.");
      countTelemetry('axon_transaction_retries_total');
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 10 * 2 ** attempt + Math.floor(Math.random() * 10)),
      );
    }
  }
  throw new ConflictError("Transaction retry limit reached.");
}
