import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import { isolatedDatabase } from "./database.js";
import { seedPerformance } from "./seed.js";
import { AccountedObjectService } from "../../src/modules/storage-accounting/application/accounted-object.service.js";
import {
  resetStorageTransactionTelemetry,
  storageTransactionTelemetry,
} from "../../src/modules/storage-accounting/application/storage-transaction-telemetry.js";
import type {
  ObjectStorage,
  StoredObjectInput,
} from "../../src/modules/shared/domain/storage/object-storage.js";
import type { PerformanceFixture } from "@repo/types/performance";

/** Component contention probe, not an HTTP capacity benchmark. All keys/data are disposable. */
class ProbeStorage implements ObjectStorage {
  readonly driver = "local" as const;
  readonly objects = new Map<string, StoredObjectInput>();
  puts = 0;
  deletes = 0;
  async put(input: StoredObjectInput): Promise<void> {
    await pause(2);
    this.objects.set(input.key, input);
    this.puts++;
  }
  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { ...value, contentLength: value.body.length } : null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deletes++;
  }
  async createSignedGetUrl() {
    return null;
  }
  async createSignedPutUrl() {
    return null;
  }
}
function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}
async function main(): Promise<void> {
  const db = await isolatedDatabase();
  const path = process.env.UPLOAD_PROBE_OUTPUT;
  const fixturePath = process.env.PERF_FIXTURE_FILE;
  if (!path || !fixturePath)
    throw new Error(
      "Explicit probe output and private fixture paths are required.",
    );
  try {
    let actor:
      | Pick<
          PerformanceFixture["actors"][number],
          "tenantId" | "userId" | "productId"
        >
      | undefined;
    if ((await db.tenant.count()) === 0) {
      const fixture = await seedPerformance(db);
      await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
      actor = fixture.actors[0];
    } else
      actor = z
        .object({
          actors: z
            .array(
              z.object({
                tenantId: z.string().min(1),
                userId: z.string().min(1),
                productId: z.string().min(1),
              }),
            )
            .min(1),
        })
        .parse(JSON.parse(await readFile(fixturePath, "utf8"))).actors[0];
    if (!actor) throw new Error("Missing probe actor.");
    const selected = actor;
    const storage = new ProbeStorage();
    const service = new AccountedObjectService(db, storage);
    const rows = [];
    for (const concurrency of [25, 50, 75, 100]) {
      resetStorageTransactionTelemetry();
      const durations: number[] = [];
      const outcomes = await Promise.allSettled(
        Array.from({ length: concurrency }, async () => {
          const key = `${selected.tenantId}/${randomUUID()}.txt`;
          const started = performance.now();
          try {
            return await service.store({
              tenantId: selected.tenantId,
              userId: selected.userId,
              source: "ERP_ATTACHMENT",
              originalName: key,
              object: {
                key,
                body: Buffer.alloc(1024, 65),
                contentType: "text/plain",
              },
              persistMetadata: (tx) =>
                tx.attachment.create({
                  data: {
                    tenantId: selected.tenantId,
                    entityType: "PRODUCT",
                    entityId: selected.productId,
                    fileName: key,
                    storagePath: key,
                    mimeType: "text/plain",
                    fileSize: 1024,
                    uploadedById: selected.userId,
                  },
                }),
              resourceId: (row) => row.id,
            });
          } finally {
            durations.push(performance.now() - started);
          }
        }),
      );
      const errors = outcomes.flatMap((row) =>
        row.status === "rejected"
          ? [
              {
                name: row.reason instanceof Error ? row.reason.name : "unknown",
                message:
                  row.reason instanceof Error ? row.reason.message : "unknown",
              },
            ]
          : [],
      );
      rows.push({
        concurrency,
        successful: concurrency - errors.length,
        failed: errors.length,
        errors,
        latency: percentiles(durations),
        telemetry: storageTransactionTelemetry(),
        provider: {
          objects: storage.objects.size,
          puts: storage.puts,
          deletes: storage.deletes,
        },
        usage: await db.tenantStorageUsage.findUnique({
          where: { tenantId: actor.tenantId },
        }),
        reservations: await db.storageReservation.groupBy({
          by: ["status"],
          where: { tenantId: actor.tenantId },
          _count: true,
        }),
        attachments: await db.attachment.count({
          where: { tenantId: actor.tenantId },
        }),
      });
    }
    const result = {
      qualification:
        "Native Node component probe, real disposable PostgreSQL, same tenant, bounded memory provider with 2ms put latency; excludes HTTP auth/scan/proxy and is not capacity evidence.",
      rows,
      passed: rows.every((row) => row.failed === 0),
    };
    await writeFile(
      path,
      JSON.stringify(
        result,
        (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
        2,
      ),
    );
    console.info(
      JSON.stringify({
        passed: result.passed,
        rows: rows.map((row) => ({
          concurrency: row.concurrency,
          failed: row.failed,
          latency: row.latency,
          telemetry: row.telemetry,
        })),
      }),
    );
    if (!result.passed) process.exitCode = 2;
  } finally {
    await db.$disconnect();
    const { prisma } = await import("../../src/lib/prisma.js");
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "Probe failed");
  process.exitCode = 1;
});
