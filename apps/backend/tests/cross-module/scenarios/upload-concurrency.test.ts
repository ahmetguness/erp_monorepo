import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Prisma } from "@prisma/client";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { db, isolatedDatabase } from "../support/database.js";
import { fixture } from "../support/fixtures.js";
import {
  FixtureObjectStorage,
  storageInput,
} from "../support/storage-fixture.js";
import { AccountedObjectService } from "../../../src/modules/storage-accounting/application/accounted-object.service.js";
import { StorageReservationService } from "../../../src/modules/storage-accounting/application/storage-reservation.service.js";
import {
  recoverStorageObjects,
  MAX_STORAGE_CLEANUP_ATTEMPTS,
} from "../../../src/modules/storage-accounting/infrastructure/storage-object-recovery.js";
import {
  storageTransactionTelemetry,
  resetStorageTransactionTelemetry,
} from "../../../src/modules/storage-accounting/application/storage-transaction-telemetry.js";
import { runWithTenantScope } from "../../../src/lib/tenant-isolation-context.js";
import { storageService } from "../../../src/services/storage.service.js";
import { createApp } from "../../../src/bootstrap/http/create-app.js";
import { readRuntimeConfig } from "../../../src/bootstrap/runtime-config.js";
import { ConflictError } from "../../../src/errors/index.js";

isolatedDatabase();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const app = createApp(readRuntimeConfig());
const identity = z.object({ data: z.object({ id: z.string() }) });

test('upload: releasing a missing reservation remains an idempotent no-op',async()=>{
  const {a}=await fixture();expect(await new StorageReservationService(db).release(a.tenant.id,'missing-reservation','CANCELLED')).toBe(false);expect(await db.tenantStorageUsage.count()).toBe(0);
});

test.each([200, 503])(
  "upload: scanner rejection/status %i creates no reservation or provider object",
  async (status) => {
    const { a } = await fixture();
    const server = createServer((request, response) => {
      request.resume();
      response.writeHead(status, { "content-type": "application/json" });
      response.end('{"clean":false}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing scanner fixture port");
    vi.stubEnv("MALWARE_SCAN_MODE", "enforce");
    vi.stubEnv(
      "MALWARE_SCAN_ENDPOINT",
      `http://127.0.0.1:${address.port}/scan`,
    );
    const put = vi.spyOn(storageService, "put");
    try {
      const form = new FormData();
      form.set(
        "file",
        new File(["scanner fixture"], "scan.txt", { type: "text/plain" }),
      );
      form.set("entityType", "PRODUCT");
      form.set("entityId", a.product.id);
      const response = await app.request("/api/attachments/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${a.identity.token}`,
          origin: "http://localhost:3100",
        },
        body: form,
      });
      expect(response.status).toBe(400);
      expect(put).not.toHaveBeenCalled();
      expect(await db.storageReservation.count()).toBe(0);
      expect(await db.tenantStorageUsage.count()).toBe(0);
      expect(await db.attachment.count()).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);

test("upload: duplicate logical versions remain real HTTP409 with one object and one charge", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  vi.spyOn(storageService, "put").mockImplementation((input) =>
    objects.put(input),
  );
  vi.spyOn(storageService, "delete").mockImplementation((key) =>
    objects.delete(key),
  );
  const responses = await Promise.all(
    Array.from({ length: 2 }, async () => {
      const form = new FormData();
      form.set(
        "file",
        new File(["duplicate"], "same-version.txt", { type: "text/plain" }),
      );
      form.set("entityType", "PRODUCT");
      form.set("entityId", a.product.id);
      return app.request("/api/attachments/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${a.identity.token}`,
          origin: "http://localhost:3100",
        },
        body: form,
      });
    }),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(objects.objects.size).toBe(1);
  expect(await db.attachment.count({ where: { tenantId: a.tenant.id } })).toBe(
    1,
  );
  expect(
    await db.tenantStorageUsage.findUnique({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ usedBytes: 9n, reservedBytes: 0n });
  expect(
    await db.storageTrafficDaily.findFirst({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ uploadCount: 1 });
});

test("upload: traffic-write failure rolls metadata and accounting back before object cleanup", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION phase82_fail_storage_traffic() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'phase82 injected traffic failure'; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER phase82_fail_storage_traffic BEFORE INSERT ON storage_traffic_daily FOR EACH ROW EXECUTE FUNCTION phase82_fail_storage_traffic()",
  );
  try {
    await expect(
      new AccountedObjectService(db, objects).store(storageInput(a)),
    ).rejects.toThrow("phase82 injected traffic failure");
    expect(await db.attachment.count()).toBe(0);
    expect(objects.objects.size).toBe(0);
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
    expect(await db.storageTrafficDaily.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER phase82_fail_storage_traffic ON storage_traffic_daily",
    );
    await db.$executeRawUnsafe("DROP FUNCTION phase82_fail_storage_traffic()");
  }
});

test.each([25, 50, 75, 100])(
  "upload: %i concurrent HTTP requests persist exact objects, bytes and traffic",
  async (concurrency) => {
    const { a } = await fixture();
    const objects = new FixtureObjectStorage();
    resetStorageTransactionTelemetry();
    vi.spyOn(storageService, "put").mockImplementation((input) =>
      objects.put(input),
    );
    vi.spyOn(storageService, "delete").mockImplementation((key) =>
      objects.delete(key),
    );
    const responses = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const form = new FormData();
        form.set(
          "file",
          new File(["synthetic upload"], `${randomUUID()}.txt`, {
            type: "text/plain",
          }),
        );
        form.set("entityType", "PRODUCT");
        form.set("entityId", a.product.id);
        const response = await app.request("/api/attachments/upload", {
          method: "POST",
          headers: {
            authorization: `Bearer ${a.identity.token}`,
            origin: "http://localhost:3100",
          },
          body: form,
        });
        const body: unknown = await response.json();
        return { status: response.status, body };
      }),
    );
    expect(
      responses.filter((r) => r.status !== 201),
      JSON.stringify(responses.filter((r) => r.status !== 201)),
    ).toHaveLength(0);
    expect(
      new Set(responses.map((r) => identity.parse(r.body).data.id)).size,
    ).toBe(concurrency);
    expect(objects.objects.size).toBe(concurrency);
    expect(
      await db.attachment.count({ where: { tenantId: a.tenant.id } }),
    ).toBe(concurrency);
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: BigInt(16 * concurrency), reservedBytes: 0n });
    expect(
      await db.storageTrafficDaily.findFirst({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({
      uploadCount: concurrency,
      uploadedBytes: BigInt(16 * concurrency),
    });
    expect(storageTransactionTelemetry().failures).toHaveLength(0);
  },
  60_000,
);

test.each(["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const)(
  "upload: %s ERP/chat race never exceeds the shared quota",
  async (plan) => {
    const { a } = await fixture();
    await db.tenant.update({ where: { id: a.tenant.id }, data: { plan } });
    await db.tenantFeatureOverride.create({
      data: {
        tenantId: a.tenant.id,
        featureKey: "STORAGE_LIMIT_BYTES",
        value: "10240",
      },
    });
    const accounting = new StorageReservationService(db);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        accounting.reserve({
          tenantId: a.tenant.id,
          source: i % 2 ? "CHAT_ATTACHMENT" : "ERP_ATTACHMENT",
          objectKey: `${a.tenant.id}/${i}`,
          originalName: "quota.txt",
          contentType: "text/plain",
          createdById: a.owner.id,
          expectedBytes: 1024,
        }),
      ),
    );
    const accepted = outcomes.flatMap((row) =>
      row.status === "fulfilled" ? [row.value] : [],
    );
    expect(accepted).toHaveLength(10);
    const failures = outcomes.flatMap((row) =>
      row.status === "rejected" ? [row.reason as unknown] : [],
    );
    expect(failures).toHaveLength(15);
    for (const error of failures) {
      expect(error).toBeInstanceOf(ConflictError);
      if (!(error instanceof ConflictError)) throw error;
      expect(error.message).toBe("Ortak depolama kotası doldu.");
    }
    expect(
      new Set(
        (
          await db.storageReservation.findMany({
            where: { tenantId: a.tenant.id },
            select: { source: true },
          })
        ).map((r) => r.source),
      ).size,
    ).toBe(2);
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: 0n, reservedBytes: 10240n });
    await Promise.all(
      accepted.map((row) =>
        accounting.release(a.tenant.id, row.id, "CANCELLED"),
      ),
    );
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
  },
);

test("upload: metadata rollback also rolls back accounting and defers failed provider cleanup", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  objects.rejectDelete = true;
  const input = storageInput(a);
  const service = new AccountedObjectService(db, objects);
  await expect(
    service.store({
      ...input,
      persistMetadata: async (tx) => {
        await input.persistMetadata(tx);
        throw new Error("Synthetic metadata failure");
      },
    }),
  ).rejects.toThrow("Synthetic metadata failure");
  expect(await db.attachment.count({ where: { tenantId: a.tenant.id } })).toBe(
    0,
  );
  expect(
    await db.storageTrafficDaily.count({ where: { tenantId: a.tenant.id } }),
  ).toBe(0);
  expect(
    await db.tenantStorageUsage.findUnique({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
  const row = await db.storageReservation.findFirstOrThrow({
    where: { tenantId: a.tenant.id },
  });
  expect(row).toMatchObject({ status: "CANCELLED", cleanupAttempts: 0 });
  expect(row.cleanupAfter).not.toBeNull();
  expect(objects.objects.size).toBe(1);
  objects.rejectDelete = false;
  await db.storageReservation.update({
    where: { id: row.id },
    data: { cleanupAfter: new Date(0) },
  });
  expect(await recoverStorageObjects(db, objects)).toBe(1);
  expect(objects.objects.size).toBe(0);
  expect(
    await db.storageReservation.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ cleanupAfter: null, cleanupAttempts: 1 });
});

test("upload: an ambiguous provider failure releases reservation and removes its partial object", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  objects.rejectPut = true;
  await expect(
    new AccountedObjectService(db, objects).store(storageInput(a)),
  ).rejects.toThrow("Synthetic ambiguous provider put");
  expect(objects.objects.size).toBe(0);
  expect(await db.attachment.count({ where: { tenantId: a.tenant.id } })).toBe(
    0,
  );
  expect(
    await db.tenantStorageUsage.findUnique({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
});

test("upload: duplicate commit/release cannot double-charge, double-release or delete committed objects", async () => {
  const { a } = await fixture();
  const service = new StorageReservationService(db);
  const row = await service.reserve({
    tenantId: a.tenant.id,
    source: "CHAT_ATTACHMENT",
    objectKey: `${a.tenant.id}/dup`,
    originalName: "dup.txt",
    contentType: "text/plain",
    createdById: a.owner.id,
    expectedBytes: 1024,
  });
  await db.storageReservation.update({
    where: { id: row.id },
    data: { status: "SCANNING" },
  });
  const commits = await Promise.all(
    Array.from({ length: 25 }, () =>
      service.commit(a.tenant.id, row.id, "one-resource"),
    ),
  );
  expect(commits.filter(Boolean)).toHaveLength(1);
  expect(
    (
      await Promise.all(
        Array.from({ length: 25 }, () =>
          service.release(a.tenant.id, row.id, "CANCELLED"),
        ),
      )
    ).some(Boolean),
  ).toBe(false);
  expect(
    await db.tenantStorageUsage.findUnique({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ usedBytes: 1024n, reservedBytes: 0n });
  expect(
    await db.storageTrafficDaily.findFirst({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ uploadCount: 1, uploadedBytes: 1024n });
  expect(await service.commit(a.tenant.id, row.id, "one-resource")).toBe(false);
  await expect(
    service.commit(a.tenant.id, row.id, "different-resource"),
  ).rejects.toBeInstanceOf(ConflictError);
  expect(await recoverStorageObjects(db, new FixtureObjectStorage())).toBe(0);
});

test("upload: failed cleanup retries stop after the bounded limit", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  objects.rejectDelete = true;
  const service = new StorageReservationService(db);
  const row = await service.reserve({
    tenantId: a.tenant.id,
    source: "ERP_ATTACHMENT",
    objectKey: `${a.tenant.id}/cleanup`,
    originalName: "x",
    contentType: "text/plain",
    createdById: a.owner.id,
    expectedBytes: 1024,
  });
  await service.release(a.tenant.id, row.id, "CANCELLED");
  for (let attempt = 1; attempt <= MAX_STORAGE_CLEANUP_ATTEMPTS; attempt++) {
    await db.storageReservation.update({
      where: { id: row.id },
      data: { cleanupAfter: new Date(0) },
    });
    await recoverStorageObjects(db, objects);
    expect(
      await db.storageReservation.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ cleanupAttempts: attempt });
  }
  await db.storageReservation.update({
    where: { id: row.id },
    data: { cleanupAfter: new Date(0) },
  });
  objects.rejectDelete = false;
  expect(await recoverStorageObjects(db, objects)).toBe(0);
  expect(
    await db.storageReservation.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ cleanupAttempts: 5, cleanupCompletedAt: null });
});

test("upload: tenant boundary applies to both raw lock statements and shared counters", async () => {
  const { a, b } = await fixture();
  const input = storageInput(b);
  await expect(
    runWithTenantScope(a.tenant.id, () =>
      new AccountedObjectService(db, new FixtureObjectStorage()).store(input),
    ),
  ).rejects.toThrow("Tenant isolation");
  expect(await db.tenantStorageUsage.count()).toBe(0);
});

test("upload: PostgreSQL proves stale Serializable snapshot versus fresh locked Read Committed row", async () => {
  const { a } = await fixture();
  await db.tenantStorageUsage.create({ data: { tenantId: a.tenant.id } });
  for (const isolationLevel of [
    Prisma.TransactionIsolationLevel.Serializable,
    Prisma.TransactionIsolationLevel.ReadCommitted,
  ]) {
    let ready: () => void = () => {};
    let changed: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      changed = resolve;
    });
    const transaction = db.$transaction(
      async (tx) => {
        await tx.tenantStorageUsage.findUniqueOrThrow({
          where: { tenantId: a.tenant.id },
        });
        ready();
        await proceed;
        return tx.$queryRaw`SELECT version FROM tenant_storage_usage WHERE "tenantId"=${a.tenant.id} FOR UPDATE`;
      },
      { isolationLevel, timeout: 5000 },
    );
    const observed = transaction.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    await started;
    await db.tenantStorageUsage.update({
      where: { tenantId: a.tenant.id },
      data: { version: { increment: 1 } },
    });
    changed();
    const result = await observed;
    if (isolationLevel === "Serializable")
      expect(result.error).toMatchObject({
        code: "P2010",
        meta: { code: "40001" },
      });
    else expect(result.error).toBeNull();
  }
});
