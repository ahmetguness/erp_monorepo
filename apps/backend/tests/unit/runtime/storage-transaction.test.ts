import { Prisma, PrismaClient } from "@prisma/client";
import { afterEach, expect, test, vi } from "vitest";
import { storageTransaction } from "../../../src/modules/storage-accounting/application/storage-transaction.js";
import {
  resetStorageTransactionTelemetry,
  storageTransactionTelemetry,
  recordStorageFailure,
} from "../../../src/modules/storage-accounting/application/storage-transaction-telemetry.js";

const db = new PrismaClient();
afterEach(() => {
  vi.restoreAllMocks();
  resetStorageTransactionTelemetry();
});
test("storage transactions use a finite Read Committed budget and never retry the callback", async () => {
  const failure = new Prisma.PrismaClientKnownRequestError(
    "Synthetic lock timeout",
    {
      code: "P2010",
      clientVersion: "test",
      meta: { code: "55P03", sensitive: "never emitted" },
    },
  );
  const transaction = vi.spyOn(db, "$transaction").mockRejectedValue(failure);
  await expect(storageTransaction(db, "reserve", async () => 42)).rejects.toBe(
    failure,
  );
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(transaction.mock.calls[0]?.[1]).toEqual({
    isolationLevel: "ReadCommitted",
    maxWait: 2000,
    timeout: 5000,
  });
  expect(storageTransactionTelemetry().failures).toEqual([
    expect.objectContaining({
      operation: "reserve",
      prismaCode: "P2010",
      sqlState: "55P03",
      attempt: 1,
    }),
  ]);
  expect(JSON.stringify(storageTransactionTelemetry())).not.toContain(
    "sensitive",
  );
});
test("storage failure samples remain bounded and omit raw error text and identifiers", () => {
  const failure = new Prisma.PrismaClientKnownRequestError(
    "private filename and database URL",
    {
      code: "P2010",
      clientVersion: "test",
      meta: { code: "40001", query: "private query" },
    },
  );
  for (let i = 0; i < 100; i++)
    recordStorageFailure("commit", "usage_update", 1, failure);
  const result = storageTransactionTelemetry();
  expect(result.failures).toHaveLength(32);
  expect(result.counters.axon_storage_commit_failures_total).toBe(100);
  expect(JSON.stringify(result)).not.toContain("private");
});
