import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { db, isolatedDatabase } from "../support/database.js";
import { fixture } from "../support/fixtures.js";
import {
  FixtureObjectStorage,
  storageInput,
} from "../support/storage-fixture.js";
import { LocalObjectStorage } from "../../../src/modules/shared/index.js";
import { storageService } from "../../../src/services/storage.service.js";
import { ChatAttachmentWorker } from "../../../src/modules/storage-accounting/infrastructure/chat-attachment.worker.js";
import { recoverStorageObjects } from "../../../src/modules/storage-accounting/infrastructure/storage-object-recovery.js";
import { AccountedObjectService } from "../../../src/modules/storage-accounting/application/accounted-object.service.js";
import { StorageReservationService } from "../../../src/modules/storage-accounting/application/storage-reservation.service.js";
import { ChatUploadService } from '../../../src/modules/collaboration/chat/application/chat-upload.service.js';

isolatedDatabase();
afterEach(() => vi.restoreAllMocks());
test('upload chat: scanned READY metadata, quota and traffic commit once through the shared accounting path',async()=>{
  const {a}=await fixture();const objects=new FixtureObjectStorage();const uploads=new ChatUploadService(db,objects);
  vi.spyOn(storageService,'get').mockImplementation(key=>objects.get(key));vi.spyOn(storageService,'delete').mockImplementation(key=>objects.delete(key));
  const ticket=await uploads.createTicket({tenantId:a.tenant.id,userId:a.owner.id,originalName:'chat.txt',contentType:'text/plain',sizeBytes:32});
  await uploads.uploadProxy(a.tenant.id,a.owner.id,ticket.reservationId,Buffer.alloc(32,65),'text/plain');
  await ChatAttachmentWorker.processBatch();await ChatAttachmentWorker.processBatch();
  expect(await db.chatAttachment.findUnique({where:{id:ticket.attachmentId}})).toMatchObject({status:'READY'});
  expect(await db.storageReservation.findUnique({where:{id:ticket.reservationId}})).toMatchObject({status:'COMMITTED',resourceId:ticket.attachmentId});
  expect(await db.tenantStorageUsage.findUnique({where:{tenantId:a.tenant.id}})).toMatchObject({usedBytes:32n,reservedBytes:0n});
  expect(await db.storageTrafficDaily.findFirst({where:{tenantId:a.tenant.id}})).toMatchObject({uploadCount:1,uploadedBytes:32n});expect(objects.objects.size).toBe(1);
});
test("upload recovery: expired cleanup lease can be reclaimed without touching a committed object", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  const input = storageInput(a);
  const service = new StorageReservationService(db);
  const row = await service.reserve({
    tenantId: a.tenant.id,
    source: "ERP_ATTACHMENT",
    objectKey: input.object.key,
    originalName: "lease",
    contentType: "text/plain",
    createdById: a.owner.id,
    expectedBytes: 1024,
  });
  await objects.put(input.object);
  await service.release(a.tenant.id, row.id, "CANCELLED");
  await db.storageReservation.update({
    where: { id: row.id },
    data: { cleanupAttempts: 1, cleanupAfter: new Date(Date.now() + 60000) },
  });
  expect(await recoverStorageObjects(db, objects)).toBe(0);
  expect(objects.objects.size).toBe(1);
  await db.storageReservation.update({
    where: { id: row.id },
    data: { cleanupAfter: new Date(0) },
  });
  expect(await recoverStorageObjects(db, objects)).toBe(1);
  expect(
    await db.storageReservation.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ cleanupAttempts: 2, cleanupAfter: null });
});

test("upload recovery: a pre-upgrade ERP SCANNING reservation removes only its own uncommitted metadata", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  const input = storageInput(a);
  const service = new StorageReservationService(db);
  const row = await service.reserve({
    tenantId: a.tenant.id,
    source: "ERP_ATTACHMENT",
    objectKey: input.object.key,
    originalName: "legacy",
    contentType: "text/plain",
    createdById: a.owner.id,
    expectedBytes: 1024,
  });
  const metadata = await input.persistMetadata(db);
  await objects.put(input.object);
  await db.storageReservation.update({
    where: { id: row.id },
    data: {
      status: "SCANNING",
      resourceId: metadata.id,
      expiresAt: new Date(0),
    },
  });
  vi.spyOn(storageService, "delete").mockImplementation((key) =>
    objects.delete(key),
  );
  await ChatAttachmentWorker.processBatch();
  expect(await db.attachment.count()).toBe(0);
  expect(objects.objects.size).toBe(0);
  expect(
    await db.tenantStorageUsage.findUnique({
      where: { tenantId: a.tenant.id },
    }),
  ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
  expect(
    await db.storageReservation.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ status: "EXPIRED" });
});
test("upload crash: killing a process after provider PUT leaves a recoverable reservation and no orphan metadata", async () => {
  const { a } = await fixture();
  const root = resolve(
    __dirname,
    "../../../../../artifacts",
    `phase82-crash-${randomUUID()}`,
  );
  const relativeRoot = relative(
    resolve(__dirname, "../../../../../artifacts"),
    root,
  );
  if (!/^phase82-crash-[a-f0-9-]{36}$/.test(relativeRoot))
    throw new Error("Unsafe crash fixture directory");
  await mkdir(root, { recursive: true });
  const key = `${a.tenant.id}/crash.txt`;
  const storage = new LocalObjectStorage(root, true);
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(
        resolve(__dirname, "../../../../../scripts/node26-tsx-shim.mjs"),
      ).href,
      "--import",
      "tsx",
      resolve(__dirname, "../support/storage-crash.child.ts"),
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        PHASE82_CRASH_INPUT: JSON.stringify({
          tenantId: a.tenant.id,
          userId: a.owner.id,
          productId: a.product.id,
          key,
          root,
        }),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let diagnostics = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4000);
  });
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  try {
    await new Promise<void>((ready, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Child checkpoint timeout: " + diagnostics)),
        15000,
      );
      child.on("message", (value: unknown) => {
        if (
          value &&
          typeof value === "object" &&
          "checkpoint" in value &&
          value.checkpoint === "provider-put"
        ) {
          clearTimeout(timer);
          ready();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Child exited before checkpoint: " + diagnostics));
      });
    });
    child.kill("SIGKILL");
    const exit = await exited;
    expect(exit.code).not.toBe(0);
    expect(await storage.get(key)).not.toBeNull();
    expect(
      await db.attachment.count({ where: { tenantId: a.tenant.id } }),
    ).toBe(0);
    const reservation = await db.storageReservation.findFirstOrThrow({
      where: { tenantId: a.tenant.id },
    });
    expect(reservation.status).toBe("RESERVED");
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: 0n, reservedBytes: 1024n });
    await db.storageReservation.update({
      where: { id: reservation.id },
      data: { expiresAt: new Date(0) },
    });
    vi.spyOn(storageService, "delete").mockRejectedValue(
      new Error("Synthetic provider delete outage"),
    );
    await ChatAttachmentWorker.processBatch();
    expect(
      await db.tenantStorageUsage.findUnique({
        where: { tenantId: a.tenant.id },
      }),
    ).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
    expect(await storage.get(key)).not.toBeNull();
    await db.storageReservation.update({
      where: { id: reservation.id },
      data: { cleanupAfter: new Date(0) },
    });
    expect(await recoverStorageObjects(db, storage)).toBe(1);
    expect(await storage.get(key)).toBeNull();
    console.info(
      JSON.stringify({
        proof: "real-process-kill-after-provider-put",
        exit,
        reservationRecovered: true,
        orphanRemoved: true,
      }),
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
    // root is validated above against the explicitly named workspace artifacts directory.
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test("upload: provider IO holds no accounting row lock and lock acquisition has a finite deadline", async () => {
  const { a } = await fixture();
  const objects = new FixtureObjectStorage();
  let entered: () => void = () => {};
  let resume: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const put = objects.put.bind(objects);
  vi.spyOn(objects, "put").mockImplementation(async (value) => {
    await put(value);
    entered();
    await gate;
  });
  const storing = new AccountedObjectService(db, objects).store(
    storageInput(a),
  );
  await waiting;
  try {
    const other = storageInput(a);
    const reservation = await new StorageReservationService(db).reserve({
      tenantId: a.tenant.id,
      source: "ERP_ATTACHMENT",
      objectKey: other.object.key,
      originalName: "other",
      contentType: "text/plain",
      createdById: a.owner.id,
      expectedBytes: 1024,
    });
    await new StorageReservationService(db).release(
      a.tenant.id,
      reservation.id,
      "CANCELLED",
    );
  } finally {
    resume();
  }
  await storing;
  let locked: () => void = () => {};
  let unlock: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const holder = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "tenantId" FROM tenant_storage_usage WHERE "tenantId"=${a.tenant.id} FOR UPDATE`;
      locked();
      await release;
    },
    { timeout: 5000 },
  );
  await held;
  const input = storageInput(a);
  const started = performance.now();
  try {
    await expect(
      new StorageReservationService(db).reserve({
        tenantId: a.tenant.id,
        source: "ERP_ATTACHMENT",
        objectKey: input.object.key,
        originalName: "timeout",
        contentType: "text/plain",
        createdById: a.owner.id,
        expectedBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "55P03" } });
    expect(performance.now() - started).toBeLessThan(4000);
  } finally {
    unlock();
    await holder;
  }
  expect(
    await db.storageReservation.findFirst({
      where: { objectKey: input.object.key },
    }),
  ).toBeNull();
});
