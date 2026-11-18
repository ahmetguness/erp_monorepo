import { Prisma } from "@prisma/client";
import { logger } from "../../../lib/logger.js";

export type StorageOperation = "reserve" | "commit" | "release";
export type StorageStep =
  | "begin"
  | "usage_init"
  | "usage_lock"
  | "usage_update"
  | "reservation_read"
  | "reservation_write"
  | "metadata"
  | "traffic";
interface Timing {
  count: number;
  milliseconds: number;
  maximumMs: number;
  buckets: number[];
}
interface Failure {
  operation: StorageOperation;
  step: StorageStep;
  attempt: number;
  milliseconds: number;
  prismaCode: string;
  sqlState: string;
}
const bounds = [
  1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
] as const;
const timings = new Map<string, Timing>();
const counters = new Map<string, number>();
const failures: Failure[] = [];

export function observeStorageTiming(
  operation: StorageOperation,
  step: StorageStep | "transaction",
  milliseconds: number,
): void {
  const key = `${operation}_${step}`;
  const row = timings.get(key) ?? {
    count: 0,
    milliseconds: 0,
    maximumMs: 0,
    buckets: Array<number>(bounds.length + 1).fill(0),
  };
  row.count++;
  row.milliseconds += milliseconds;
  row.maximumMs = Math.max(row.maximumMs, milliseconds);
  const bucket = bounds.findIndex((bound) => milliseconds <= bound);
  row.buckets[bucket < 0 ? bounds.length : bucket]++;
  timings.set(key, row);
}
export function recordStorageFailure(
  operation: StorageOperation,
  step: StorageStep,
  milliseconds: number,
  error: unknown,
): void {
  const known = error instanceof Prisma.PrismaClientKnownRequestError;
  const prismaCode =
    known && /^P\d{4}$/.test(error.code) ? error.code : "other";
  const sqlState =
    known &&
    typeof error.meta?.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.meta.code)
      ? error.meta.code
      : "unknown";
  if (failures.length === 32) failures.shift();
  failures.push({
    operation,
    step,
    attempt: 1,
    milliseconds,
    prismaCode,
    sqlState,
  });
  if (known)
    logger.warn("[StorageTransaction] Database operation failed", {
      operation,
      step,
      attempt: 1,
      databaseFailure: prismaCode,
      sqlState,
      durationMs: Math.round(milliseconds),
    });
  counters.set(
    `axon_storage_${operation}_failures_total`,
    (counters.get(`axon_storage_${operation}_failures_total`) ?? 0) + 1,
  );
}
export function storageTransactionTelemetry() {
  const metrics: Record<string, number> = Object.fromEntries(counters);
  const rows = Object.fromEntries(
    [...timings].map(([key, row]) => {
      metrics[`axon_storage_${key}_count_total`] = row.count;
      metrics[`axon_storage_${key}_milliseconds_total`] = row.milliseconds;
      metrics[`axon_storage_${key}_maximum_milliseconds`] = row.maximumMs;
      let accumulated = 0;
      const target = Math.ceil(row.count * 0.95);
      const bucket = row.buckets.findIndex((value) => {
        accumulated += value;
        return accumulated >= target;
      });
      return [
        key,
        {
          count: row.count,
          milliseconds: row.milliseconds,
          maximumMs: row.maximumMs,
          p95UpperBoundMs: bounds[bucket] ?? null,
        },
      ];
    }),
  );
  return {
    counters: metrics,
    timings: rows,
    failures: failures.map((row) => ({ ...row })),
  };
}
export function resetStorageTransactionTelemetry(): void {
  timings.clear();
  counters.clear();
  failures.length = 0;
}
