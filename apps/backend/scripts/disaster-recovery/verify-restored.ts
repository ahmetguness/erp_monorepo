import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/bootstrap/http/create-app.js";
import { readRuntimeConfig } from "../../src/bootstrap/runtime-config.js";
import { checkInvariants } from "../performance/invariants.js";
import { recoverExpiredLeases } from "../../src/domain-events/delivery/repository.js";
import { processDomainEventOutboxBatch } from "../../src/services/domain-event-outbox-worker.service.js";
import { recoverStorageObjects } from "../../src/modules/storage-accounting/infrastructure/storage-object-recovery.js";
import { LocalObjectStorage } from "../../src/modules/shared/infrastructure/storage/local-storage.js";
import { assertExpectationFile, assertRestoreScope } from "./restore-scope.js";

const schema = z
  .object({
    tenantId: z.string().min(1),
    otherToken: z.string().min(1),
    token: z.string().min(1),
    invoiceId: z.string().min(1),
    paymentId: z.string().min(1),
    productId: z.string().min(1),
    warehouseId: z.string().min(1),
    objectKey: z.string().min(1),
    orphanKey: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    objectRoot: z.string().min(1),
    output: z.string().min(1),
    payment: z
      .object({
        contactId: z.string(),
        cashAccountId: z.string(),
        amount: z.literal(200),
        date: z.string(),
        method: z.literal("CASH"),
        direction: z.literal("RECEIVE"),
        idempotencyKey: z.literal("dr-payment"),
        allocations: z.array(
          z.object({ invoiceId: z.string(), amount: z.literal(200) }),
        ),
      })
      .strict(),
  })
  .strict();
const verificationDb = new PrismaClient();
let checkpoint = "input";
let server: ReturnType<typeof createServer> | undefined;

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.pathname, "/phase3_dr_ci");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assertExpectationFile();
  const input = schema.parse(
    JSON.parse(await readFile(process.env.DR_EXPECTATION_FILE ?? "", "utf8")),
  );
  const owner = assertRestoreScope(input);
  const identity = await verificationDb.$queryRaw<
    Array<{ owner: string }>
  >`SELECT owner FROM axon_dr.identity`;
  assert.equal(identity.length, 1);
  assert.equal(identity[0]?.owner, owner);
  const app = createApp(readRuntimeConfig());
  server = createServer(getRequestListener(app.fetch));
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const api = (
    method: string,
    path: string,
    body?: unknown,
    token = input.token,
  ) =>
    fetch(new URL(path, origin), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:3100",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  checkpoint = "api-smoke";
  const invariantBefore = await checkInvariants(verificationDb);
  assert.ok(invariantBefore.passed);
  assert.equal(
    (await api("GET", `/api/invoices/${input.invoiceId}`)).status,
    200,
  );
  assert.equal((await api("GET", "/api/products")).status, 200);
  assert.equal((await api("GET", "/api/contacts")).status, 200);
  assert.equal((await api("GET", "/api/payments")).status, 200);
  assert.equal(
    (
      await api(
        "GET",
        `/api/invoices/${input.invoiceId}`,
        undefined,
        input.otherToken,
      )
    ).status,
    404,
  );
  checkpoint = "financial-replay";
  const paymentCount = await verificationDb.payment.count();
  const journalCount = await verificationDb.journalEntry.count();
  const stockBefore = await verificationDb.stockLevel.aggregate({
    where: { tenantId: input.tenantId },
    _sum: { quantity: true },
  });
  const approve = () =>
    api("POST", `/api/invoices/${input.invoiceId}/approve`, {
      idempotencyKey: "dr-invoice",
    });
  assert.deepEqual(
    (await Promise.all([approve(), approve()])).map((r) => r.status),
    [200, 200],
  );
  const pay = () => api("POST", "/api/payments", input.payment);
  for (const response of await Promise.all([pay(), pay()])) {
    assert.equal(response.status, 201);
    assert.equal(
      z
        .object({ data: z.object({ id: z.string() }) })
        .parse(await response.json()).data.id,
      input.paymentId,
    );
  }
  // The physical backup contains a real claimed worker lease. Advancing only
  // that fixture's expiry models the wait without relaxing production leases.
  checkpoint = "worker-recovery";
  const processing = await verificationDb.domainEventOutbox.count({
    where: { status: "PROCESSING" },
  });
  assert.ok(processing > 0);
  await prisma.domainEventOutbox.updateMany({
    where: { tenantId: input.tenantId, status: "PROCESSING" },
    data: { leaseExpiresAt: new Date(0) },
  });
  assert.ok((await recoverExpiredLeases()) > 0);
  await Promise.all([
    processDomainEventOutboxBatch(),
    processDomainEventOutboxBatch(),
  ]);
  const receipts = await verificationDb.domainEventDelivery.count();
  const notifications = await verificationDb.notification.count();
  assert.ok(receipts > 0);
  assert.ok(notifications > 0);
  await processDomainEventOutboxBatch();
  assert.equal(await verificationDb.domainEventDelivery.count(), receipts);
  assert.equal(await verificationDb.notification.count(), notifications);
  assert.equal(
    await verificationDb.domainEventOutbox.count({
      where: {
        status: { in: ["PENDING", "PROCESSING", "FAILED", "DEAD_LETTER"] },
      },
    }),
    0,
  );
  assert.equal(await verificationDb.payment.count(), paymentCount);
  assert.equal(await verificationDb.journalEntry.count(), journalCount);
  assert.deepEqual(
    await verificationDb.stockLevel.aggregate({
      where: { tenantId: input.tenantId },
      _sum: { quantity: true },
    }),
    stockBefore,
  );
  checkpoint = "storage-recovery";
  const objects = new LocalObjectStorage(input.objectRoot, true);
  const object = await objects.get(input.objectKey);
  assert.ok(object);
  assert.equal(
    createHash("sha256").update(object.body).digest("hex"),
    input.contentHash,
  );
  assert.ok(await objects.get(input.orphanKey));
  assert.equal(await recoverStorageObjects(prisma, objects), 1);
  assert.equal(await objects.get(input.orphanKey), null);
  assert.ok(await objects.get(input.objectKey));
  assert.equal(await recoverStorageObjects(prisma, objects), 0);
  const usage = await verificationDb.tenantStorageUsage.findUniqueOrThrow({
    where: { tenantId: input.tenantId },
  });
  assert.equal(usage.usedBytes, 1024n);
  assert.equal(usage.reservedBytes, 0n);
  assert.equal(
    await verificationDb.storageReservation.count({
      where: { status: { in: ["RESERVED", "UPLOADED", "SCANNING"] } },
    }),
    0,
  );
  checkpoint = "fresh-order-to-cash";
  const create = async (path: string, body: unknown): Promise<string> => {
    const response = await api("POST", path, body);
    assert.equal(response.status, 201);
    return z
      .object({ data: z.object({ id: z.string() }) })
      .parse(await response.json()).data.id;
  };
  const date = "2026-11-18";
  const orderId = await create("/api/sales-orders", {
    contactId: input.payment.contactId,
    date,
    items: [{ productId: input.productId, quantity: 1, unitPrice: 100 }],
  });
  const orderItem = await verificationDb.salesOrderItem.findFirstOrThrow({
    where: { tenantId: input.tenantId, orderId },
  });
  const deliveryId = await create("/api/delivery-notes", {
    type: "OUTBOUND",
    salesOrderId: orderId,
    contactId: input.payment.contactId,
    warehouseId: input.warehouseId,
    date,
    items: [
      {
        productId: input.productId,
        orderedQty: 1,
        deliveredQty: 1,
        salesOrderItemId: orderItem.id,
      },
    ],
  });
  assert.equal(
    (
      await api("PATCH", `/api/delivery-notes/${deliveryId}/status`, {
        status: "DELIVERED",
      })
    ).status,
    200,
  );
  const invoiceId = await create("/api/invoices", {
    contactId: input.payment.contactId,
    salesOrderId: orderId,
    type: "SALES",
    date,
    lines: [
      {
        productId: input.productId,
        description: "Created on restored database",
        quantity: 1,
        unitPrice: 100,
      },
    ],
  });
  assert.equal(
    (
      await api("POST", `/api/invoices/${invoiceId}/approve`, {
        idempotencyKey: "dr-new-posting",
      })
    ).status,
    200,
  );
  await create("/api/payments", {
    ...input.payment,
    amount: 100,
    idempotencyKey: "dr-new-payment",
    allocations: [{ invoiceId, amount: 100 }],
  });
  assert.equal(
    (
      await api(
        "GET",
        `/api/invoices/${invoiceId}`,
        undefined,
        input.otherToken,
      )
    ).status,
    404,
  );
  assert.equal(await verificationDb.payment.count(), paymentCount + 1);
  const stockAfter = await verificationDb.stockLevel.aggregate({
    where: { tenantId: input.tenantId },
    _sum: { quantity: true },
  });
  assert.equal(stockBefore._sum.quantity?.toString(), "8");
  assert.equal(stockAfter._sum.quantity?.toString(), "7");
  const invariants = await checkInvariants(verificationDb);
  assert.ok(invariants.passed);
  await writeFile(
    input.output,
    JSON.stringify(
      {
        passed: true,
        transport: "real loopback HTTP + Hono middleware + real PostgreSQL",
        apiSmoke: true,
        freshOrderToCash: true,
        tenantIsolation: true,
        duplicatePaymentAndPosting: true,
        workerLeaseRecovery: true,
        duplicateDelivery: true,
        notifications,
        receipts,
        storageCleanup: true,
        objectHashVerified: true,
        invariantBefore,
        invariants,
      },
      null,
      2,
    ),
  );
}
main()
  .catch(() => {
    console.error(
      `Restored ERP verification failed at ${checkpoint}; no credentials emitted.`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    server?.closeAllConnections();
    if (server?.listening)
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    await Promise.all([prisma.$disconnect(), verificationDb.$disconnect()]);
  });
