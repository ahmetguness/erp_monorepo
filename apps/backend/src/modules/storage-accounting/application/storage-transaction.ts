import { Prisma, type PrismaClient } from "@prisma/client";
import {
  observeStorageTiming,
  recordStorageFailure,
  type StorageOperation,
  type StorageStep,
} from "./storage-transaction-telemetry.js";

/** All accounting writers lock usage then reservation. No provider IO or callback retry. */
export async function storageTransaction<T>(
  db: PrismaClient,
  operation: StorageOperation,
  callback: (
    tx: Prisma.TransactionClient,
    step: (value: StorageStep) => void,
  ) => Promise<T>,
): Promise<T> {
  const started = performance.now();
  let step: StorageStep = "begin";
  let stepStarted = started;
  const next = (value: StorageStep) => {
    const now = performance.now();
    observeStorageTiming(operation, step, now - stepStarted);
    step = value;
    stepStarted = now;
  };
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('lock_timeout','1500ms',true), set_config('statement_timeout','4000ms',true)`;
        return callback(tx, next);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 2000,
        timeout: 5000,
      },
    );
  } catch (error: unknown) {
    recordStorageFailure(operation, step, performance.now() - started, error);
    throw error;
  } finally {
    observeStorageTiming(operation, step, performance.now() - stepStarted);
    observeStorageTiming(operation, "transaction", performance.now() - started);
  }
}
