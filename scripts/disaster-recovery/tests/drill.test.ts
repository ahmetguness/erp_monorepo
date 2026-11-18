import { beforeAll, afterAll, expect, test, vi } from "vitest";
import type {} from "../../../apps/backend/src/types/hono-context.js";
import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { DrillCluster } from "../cluster.js";
import { RecoveryOperations } from "../operations.js";
import { docker, run } from "../process.js";
import { owner } from "../validation.js";
import { db } from "../../../apps/backend/tests/cross-module/support/database.js";
import { fixture } from "../../../apps/backend/tests/cross-module/support/fixtures.js";
import {
  create,
  request,
} from "../../../apps/backend/tests/cross-module/support/http.js";
import {
  addStock,
  assertBalancedJournal,
} from "../../../apps/backend/tests/cross-module/support/invariants.js";
import { LocalObjectStorage } from "../../../apps/backend/src/modules/shared/infrastructure/storage/local-storage.js";
import { AccountedObjectService } from "../../../apps/backend/src/modules/storage-accounting/application/accounted-object.service.js";
import { storageInput } from "../../../apps/backend/tests/cross-module/support/storage-fixture.js";
import { checkInvariants } from "../../../apps/backend/scripts/performance/invariants.js";
import { StorageReservationService } from "../../../apps/backend/src/modules/storage-accounting/application/storage-reservation.service.js";
import { claimNextEvent } from "../../../apps/backend/src/domain-events/delivery/repository.js";
import { inspectRestoredStorage } from "../../../apps/backend/scripts/disaster-recovery/storage-inspection.js";
import { cloneRepository, interruptBackrest } from "./faults.js";
import { repositoryHealth } from "../health.js";
import { storageService } from "../../../apps/backend/src/services/storage.service.js";
import { databaseFingerprint } from "../../../apps/backend/scripts/disaster-recovery/database-inspection.js";

const cluster = new DrillCluster(owner(process.env.DR_OWNER));
const operations = new RecoveryOperations(cluster);
const objects = new LocalObjectStorage(
  resolve(cluster.directory, "private", "objects"),
  true,
);
const measurements: Record<string, unknown> = {};
let state: Awaited<ReturnType<typeof seed>>;
let backupLabel = "";
let recoveryTime = "";
let restoreTarget = "";
let recoveryStarted = 0;
let sourceFingerprint: Awaited<ReturnType<typeof databaseFingerprint>>;

async function seed() {
  const fixtures = await fixture();
  const { a } = fixtures;
  await addStock(a, 10);
  const orderId = await create("/api/sales-orders", a.identity, {
    contactId: a.contact.id,
    date: "2026-11-18",
    items: [{ productId: a.product.id, quantity: 2, unitPrice: 100 }],
  });
  const orderItem = await db.salesOrderItem.findFirstOrThrow({
    where: { tenantId: a.tenant.id, orderId },
  });
  const deliveryId = await create("/api/delivery-notes", a.identity, {
    type: "OUTBOUND",
    salesOrderId: orderId,
    contactId: a.contact.id,
    warehouseId: a.warehouse.id,
    date: "2026-11-18",
    items: [
      {
        productId: a.product.id,
        orderedQty: 2,
        deliveredQty: 2,
        salesOrderItemId: orderItem.id,
      },
    ],
  });
  expect(
    (
      await request(
        "PATCH",
        `/api/delivery-notes/${deliveryId}/status`,
        a.identity,
        { status: "DELIVERED" },
      )
    ).status,
  ).toBe(200);
  const invoiceId = await create("/api/invoices", a.identity, {
    contactId: a.contact.id,
    salesOrderId: orderId,
    type: "SALES",
    date: "2026-11-18",
    lines: [
      {
        productId: a.product.id,
        description: "Recovery invoice",
        quantity: 2,
        unitPrice: 100,
      },
    ],
  });
  expect(
    (
      await request("POST", `/api/invoices/${invoiceId}/approve`, a.identity, {
        idempotencyKey: "dr-invoice",
      })
    ).status,
  ).toBe(200);
  const payment = {
    contactId: a.contact.id,
    cashAccountId: a.cash.id,
    amount: 200,
    date: "2026-11-18",
    method: "CASH",
    direction: "RECEIVE",
    idempotencyKey: "dr-payment",
    allocations: [{ invoiceId, amount: 200 }],
  };
  const paymentId = await create("/api/payments", a.identity, payment);
  await assertBalancedJournal(a.tenant.id, invoiceId);
  const input = storageInput(a);
  const attachment = await new AccountedObjectService(db, objects).store(input);
  const contentHash = createHash("sha256")
    .update(input.object.body)
    .digest("hex");
  await mkdir(resolve(cluster.directory, "private", "object-escrow"), {
    recursive: true,
  });
  await writeFile(
    resolve(cluster.directory, "private", "object-escrow", contentHash),
    input.object.body,
    { flag: "wx" },
  );
  const reservations = new StorageReservationService(db);
  const orphanKey = `${a.tenant.id}/recovery-orphan.txt`;
  const orphan = await reservations.reserve({
    tenantId: a.tenant.id,
    source: "ERP_ATTACHMENT",
    objectKey: orphanKey,
    originalName: "orphan.txt",
    contentType: "text/plain",
    createdById: a.owner.id,
    expectedBytes: 32,
  });
  await objects.put({
    key: orphanKey,
    body: Buffer.alloc(32, 66),
    contentType: "text/plain",
  });
  await reservations.release(a.tenant.id, orphan.id, "CANCELLED");
  await db.storageReservation.update({
    where: { id: orphan.id },
    data: { cleanupAfter: new Date(0) },
  });
  const event = await db.domainEventOutbox.findFirstOrThrow({
    where: { tenantId: a.tenant.id, name: "payment.received" },
  });
  expect(await claimNextEvent(a.tenant.id, event.id)).not.toBeNull();
  return {
    ...fixtures,
    invoiceId,
    orderId,
    paymentId,
    payment,
    attachment,
    objectKey: input.object.key,
    orphanKey,
    contentHash,
  };
}
beforeAll(async () => {
  state = await seed();
  sourceFingerprint = await databaseFingerprint(db);
});
afterAll(async () => {
  await writeFile(
    resolve(cluster.directory, "measurements.json"),
    JSON.stringify(measurements, null, 2),
  );
  await db.$disconnect();
  const { prisma } = await import("../../../apps/backend/src/lib/prisma.js");
  await prisma.$disconnect();
});

test("clean encrypted physical backup, full migration history and repository integrity", async () => {
  const started = performance.now();
  const backup = await operations.backup();
  backupLabel = backup.label;
  await operations.verify();
  measurements.backup = { ...backup, durationMs: performance.now() - started };
  expect(sourceFingerprint.migrations.count).toBeGreaterThan(0);
  measurements.fingerprint = sourceFingerprint;
});

test("a real base backup restores to a separate empty PostgreSQL and preserves ERP invariants", async () => {
  expect(backupLabel).not.toBe("");
  const target = await operations.newTarget("base");
  const started = performance.now();
  await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
    backup: backupLabel,
  });
  const restored = new PrismaClient({
    datasources: { db: { url: await cluster.connection(target) } },
  });
  try {
    expect(await checkInvariants(restored)).toMatchObject({ passed: true });
    expect(await restored.invoice.count()).toBe(1);
    expect(await restored.payment.count()).toBe(1);
    expect(await restored.attachment.count()).toBe(1);
    expect(await databaseFingerprint(restored)).toEqual(sourceFingerprint);
    measurements.baseRestore = {
      durationMs: performance.now() - started,
      invariants: await checkInvariants(restored),
    };
  } finally {
    await restored.$disconnect();
  }
});

test("PITR replays post-backup commits and excludes destructive writes after the requested time", async () => {
  expect(backupLabel).not.toBe("");
  await db.contact.create({
    data: {
      tenantId: state.a.tenant.id,
      type: "CUSTOMER",
      code: "PITR_KEEP",
      name: "Committed after full backup",
    },
  });
  recoveryTime = await cluster.sql(
    cluster.source,
    "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
  );
  await cluster.sql(cluster.source, "SELECT pg_sleep(1)");
  await db.contact.create({
    data: {
      tenantId: state.a.tenant.id,
      type: "CUSTOMER",
      code: "PITR_EXCLUDE",
      name: "After requested target",
    },
  });
  const incidentAt = new Date();
  await cluster.sql(cluster.source, "SELECT pg_switch_wal()");
  await operations.backrest(cluster.source, ["check"]);
  recoveryStarted = performance.now();
  restoreTarget = await operations.newTarget("pitr");
  const started = recoveryStarted;
  await operations.restore(
    restoreTarget,
    `RESTORE ${restoreTarget} FROM ${cluster.id}`,
    { backup: backupLabel, time: recoveryTime },
  );
  const restored = new PrismaClient({
    datasources: { db: { url: await cluster.connection(restoreTarget) } },
  });
  try {
    expect(await restored.contact.count({ where: { code: "PITR_KEEP" } })).toBe(
      1,
    );
    expect(
      await restored.contact.count({ where: { code: "PITR_EXCLUDE" } }),
    ).toBe(0);
    const invariants = await checkInvariants(restored);
    expect(invariants.passed).toBe(true);
    const recoveredCommit = await cluster.sql(
      restoreTarget,
      "SELECT to_char(pg_xact_commit_timestamp(xmin) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM contacts WHERE code='PITR_KEEP'",
    );
    const rpoSeconds =
      (incidentAt.getTime() - Date.parse(recoveredCommit)) / 1000;
    const rtoSeconds = (performance.now() - started) / 1000;
    expect(rpoSeconds).toBeGreaterThanOrEqual(0);
    expect(rpoSeconds).toBeLessThanOrEqual(900);
    expect(rtoSeconds).toBeLessThanOrEqual(14400);
    measurements.pitr = {
      target: recoveryTime,
      recoveredCommit,
      incidentAt: incidentAt.toISOString(),
      rpoSeconds,
      physicalRestoreSeconds: rtoSeconds,
      invariants,
    };
    await writeFile(
      resolve(cluster.directory, "private", "restore-fixture.json"),
      JSON.stringify({
        tenantId: state.a.tenant.id,
        token: state.a.identity.token,
        otherToken: state.b.identity.token,
        productId: state.a.product.id,
        warehouseId: state.a.warehouse.id,
        invoiceId: state.invoiceId,
        paymentId: state.paymentId,
        payment: state.payment,
        objectKey: state.objectKey,
        orphanKey: state.orphanKey,
        contentHash: state.contentHash,
        objectRoot: resolve(cluster.directory, "private", "objects"),
        output: resolve(cluster.directory, "restored-erp.json"),
      }),
      { mode: 0o600 },
    );
  } finally {
    await restored.$disconnect();
  }
});

test("wrong target, missing explicit approval and non-empty targets are rejected without overwriting", async () => {
  await expect(
    operations.restore(
      cluster.source,
      `RESTORE ${cluster.source} FROM ${cluster.id}`,
      { backup: backupLabel },
    ),
  ).rejects.toThrow();
  const target = await operations.newTarget("unapproved");
  await expect(
    operations.restore(target, "", { backup: backupLabel }),
  ).rejects.toThrow("approval");
  await expect(
    operations.restore(
      restoreTarget,
      `RESTORE ${restoreTarget} FROM ${cluster.id}`,
      { backup: backupLabel },
    ),
  ).rejects.toThrow();
  expect(
    await cluster.sql(
      restoreTarget,
      "SELECT count(*) FROM contacts WHERE code='PITR_KEEP'",
    ),
  ).toBe("1");
});

test("repository and WAL contents are encrypted, restore repository access is read-only", async () => {
  const result = await run("docker", [
    "exec",
    restoreTarget,
    "sh",
    "-ec",
    "touch /var/lib/pgbackrest/forbidden",
  ]);
  expect(result.code).not.toBe(0);
  const listing = await docker([
    "exec",
    cluster.source,
    "sh",
    "-ec",
    "find /var/lib/pgbackrest -name backup.info -type f -exec head -c 8 {} \\;",
  ]);
  expect(listing).toBe("Salted__");
});

test("restored API, duplicate financial commands, worker lease replay and durable orphan cleanup", async () => {
  expect(restoreTarget).not.toBe("");
  const started = performance.now();
  const result = await run(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve("scripts/node26-tsx-shim.mjs")).href,
      "--import",
      "tsx",
      "apps/backend/scripts/disaster-recovery/verify-restored.ts",
    ],
    undefined,
    {
      ...process.env,
      DATABASE_URL: await cluster.connection(restoreTarget),
      DR_EXPECTATION_FILE: resolve(
        cluster.directory,
        "private",
        "restore-fixture.json",
      ),
    },
  );
  await writeFile(
    resolve(cluster.directory, "restored-api.log"),
    result.stdout + "\n" + result.stderr,
  );
  expect(result.code).toBe(0);
  measurements.apiVerificationSeconds = (performance.now() - started) / 1000;
  const evidence: unknown = JSON.parse(
    await readFile(resolve(cluster.directory, "restored-erp.json"), "utf8"),
  );
  measurements.restoredErp = evidence;
  const applicationRecoverySeconds =
    (performance.now() - recoveryStarted) / 1000;
  expect(applicationRecoverySeconds).toBeLessThanOrEqual(14400);
  measurements.applicationRecoverySeconds = applicationRecoverySeconds;
});

test("missing and inaccessible objects fail integrity; a retained version recovers a post-backup deletion", async () => {
  const restored = new PrismaClient({
    datasources: { db: { url: await cluster.connection(restoreTarget) } },
  });
  try {
    expect(await inspectRestoredStorage(restored, objects)).toMatchObject({
      passed: true,
      checked: 1,
    });
    await objects.delete(state.objectKey);
    expect(await inspectRestoredStorage(restored, objects)).toMatchObject({
      passed: false,
      missing: 1,
    });
    const body = await readFile(
      resolve(cluster.directory, "private", "object-escrow", state.contentHash),
    );
    expect(createHash("sha256").update(body).digest("hex")).toBe(
      state.contentHash,
    );
    await objects.put({
      key: state.objectKey,
      body,
      contentType: "text/plain",
    });
    expect(await inspectRestoredStorage(restored, objects)).toMatchObject({
      passed: true,
    });
    const offline = {
      ...objects,
      get: async () => {
        throw new Error("Synthetic object access outage");
      },
      put: objects.put.bind(objects),
      delete: objects.delete.bind(objects),
      createSignedGetUrl: objects.createSignedGetUrl.bind(objects),
      createSignedPutUrl: objects.createSignedPutUrl.bind(objects),
    };
    expect(await inspectRestoredStorage(restored, offline)).toMatchObject({
      passed: false,
      inaccessible: 1,
    });
  } finally {
    await restored.$disconnect();
  }
});

test("restore verifier rejects foreign or absent database ownership before mutations", async () => {
  const target = await operations.newTarget("foreignidentity");
  await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
    backup: backupLabel,
  });
  await cluster.sql(
    target,
    "UPDATE axon_dr.identity SET owner='axon-dr-000000000000'",
  );
  // Each attempt explicitly addresses only this owned target.
  const env = {
    ...process.env,
    DATABASE_URL: await cluster.connection(target),
    DR_EXPECTATION_FILE: resolve(
      cluster.directory,
      "private",
      "restore-fixture.json",
    ),
  };
  const args = [
    "--import",
    pathToFileURL(resolve("scripts/node26-tsx-shim.mjs")).href,
    "--import",
    "tsx",
    "apps/backend/scripts/disaster-recovery/verify-restored.ts",
  ];
  expect((await run(process.execPath, args, undefined, env)).code).not.toBe(0);
  await cluster.sql(target, "DROP SCHEMA axon_dr CASCADE");
  expect((await run(process.execPath, args, undefined, env)).code).not.toBe(0);
  expect(await cluster.sql(target, "SELECT count(*) FROM payments")).toBe("1");
  expect(
    await cluster.sql(
      target,
      "SELECT count(*) FROM domain_event_outbox WHERE status='PROCESSING'",
    ),
  ).toBe("1");
  expect(
    await cluster.sql(
      target,
      'SELECT count(*) FROM storage_reservations WHERE "cleanupCompletedAt" IS NOT NULL',
    ),
  ).toBe("0");
});

test("corrupted and missing backup payloads cannot restore; the original repository remains intact", async () => {
  for (const fault of ["corrupt", "missing"] as const) {
    const copy = await cloneRepository(cluster, fault);
    const target = await operations.newTarget(fault, copy);
    // Faults touch the disposable clone only, through its dedicated root mount.
    await docker([
      "run",
      "--rm",
      "--name",
      `${cluster.id}-helper-fault-${fault}`,
      "--label",
      `com.axon.dr=${cluster.id}`,
      "--entrypoint",
      "sh",
      "--mount",
      `type=volume,source=${copy},target=/repo`,
      "axon-postgres-dr:phase9",
      "-ec",
      fault === "corrupt"
        ? 'file=$(find "$1" -name "pg_control*" -type f | head -1); test -s "$file"; printf corrupted > "$file"'
        : 'file=$(find "$1" -name "pg_control*" -type f | head -1); test -s "$file"; rm -- "$file"',
      "fault",
      `/repo/backup/erp/${backupLabel}/pg_data/global`,
    ]);
    await expect(
      operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
        backup: backupLabel,
      }),
    ).rejects.toThrow();
  }
  await operations.verify();
});

test("an unavailable key fails closed and an independently escrowed key can recover the repository", async () => {
  const missing = await run("docker", [
    "exec",
    "-e",
    "DR_CIPHER_FILE=/does-not-exist",
    restoreTarget,
    "dr-configure",
    "pgbackrest",
    "--stanza=erp",
    "info",
  ]);
  expect(missing.code).toBe(20);
  expect(missing.stdout).toBe("");
  const escrow = await readFile(cluster.keyFile);
  const escrowPath = resolve(cluster.directory, "private", "key-escrow");
  await writeFile(escrowPath, escrow, { mode: 0o600 });
  // A new independently configured process exercises retrieval, not a cached key.
  const recovered = await run("docker", [
    "run",
    "--rm",
    "--name",
    `${cluster.id}-helper-key-recovery`,
    "--user",
    "postgres",
    "--label",
    `com.axon.dr=${cluster.id}`,
    "--mount",
    `type=volume,source=${cluster.repository},target=/var/lib/pgbackrest,readonly`,
    "--mount",
    `type=bind,source=${escrowPath},target=/run/secrets/dr_cipher,readonly`,
    "axon-postgres-dr:phase9",
    "pgbackrest",
    "--stanza=erp",
    "--output=json",
    "info",
  ]);
  expect(recovered.code).toBe(0);
  const escrowTarget = await operations.newTarget(
    "escrow",
    cluster.repository,
    escrowPath,
  );
  await operations.restore(
    escrowTarget,
    `RESTORE ${escrowTarget} FROM ${cluster.id}`,
    { backup: backupLabel },
  );
  expect(await cluster.sql(escrowTarget, "SELECT count(*) FROM payments")).toBe(
    "1",
  );
  measurements.escrowRecovery = {
    independentKeyFile: true,
    physicalRestore: true,
  };
  const wrongPath = resolve(cluster.directory, "private", "wrong-key");
  await writeFile(wrongPath, randomBytes(48).toString("base64"), {
    mode: 0o600,
  });
  const wrong = await run("docker", [
    "run",
    "--rm",
    "--name",
    `${cluster.id}-helper-wrong-key`,
    "--user",
    "postgres",
    "--label",
    `com.axon.dr=${cluster.id}`,
    "--mount",
    `type=volume,source=${cluster.repository},target=/var/lib/pgbackrest,readonly`,
    "--mount",
    `type=bind,source=${wrongPath},target=/run/secrets/dr_cipher,readonly`,
    "axon-postgres-dr:phase9",
    "pgbackrest",
    "--stanza=erp",
    "--output=json",
    "info",
  ]);
  // info may return zero with an embedded error status; parseBackups must reject it.
  const { parseBackups } = await import("../operations.js");
  if (wrong.code === 0) expect(() => parseBackups(wrong.stdout)).toThrow();
  else expect(wrong.code).not.toBe(0);
  // Do not persist the key or pgBackRest output in public evidence.
});

test("process death during backup leaves no successful partial backup and supports bounded retry", async () => {
  const before = await operations.info();
  const crash = await interruptBackrest(
    cluster,
    cluster.source,
    ["--type=full", "--process-max=1", "--compress-level=9", "backup"],
    'test -s /tmp/dr-operation.pid; find /tmp/pgbackrest -name "erp-backup-*.lock" | grep -q .',
  );
  expect(crash.checkpointReached).toBe(true);
  expect(crash.exitCode).not.toBe(0);
  const after = await operations.info();
  expect(after.map((row) => row.label)).toEqual(before.map((row) => row.label));
  const retry = await operations.backup();
  expect(retry.label).not.toBe(backupLabel);
  await operations.verify();
  measurements.backupCrash = crash;
});

test("process death during restore preserves failed target, refuses overwrite and recovers to another fresh target", async () => {
  const target = await operations.newTarget("crashed");
  await docker([
    "exec",
    target,
    "chown",
    "postgres:postgres",
    "/var/lib/postgresql/data",
  ]);
  const crash = await interruptBackrest(
    cluster,
    target,
    ["--set=" + backupLabel, "--process-max=1", "--type=immediate", "restore"],
    "test -s /tmp/dr-operation.pid; test -s /var/lib/postgresql/data/backup.manifest",
  );
  expect(crash.checkpointReached).toBe(true);
  expect(crash.exitCode).not.toBe(0);
  await expect(
    operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
      backup: backupLabel,
    }),
  ).rejects.toThrow();
  const retry = await operations.newTarget("retry");
  await operations.restore(retry, `RESTORE ${retry} FROM ${cluster.id}`, {
    backup: backupLabel,
  });
  expect(await cluster.sql(retry, "SELECT count(*) FROM payments")).toBe("1");
  measurements.restoreCrash = crash;
});

test("retention expiration keeps the newest complete recovery chain restorable", async () => {
  const before = await operations.info();
  expect(before.length).toBeGreaterThanOrEqual(2);
  await cluster.audit.write("expire", "STARTED", cluster.source);
  await operations.backrest(cluster.source, [
    "--repo1-retention-full=1",
    "expire",
  ]);
  const after = await operations.info();
  expect(after).toHaveLength(1);
  expect(after[0]?.label).toBe(before.at(-1)?.label);
  await operations.verify();
  const target = await operations.newTarget("retained");
  const latest = after[0];
  if (!latest) throw new Error("Missing retained recovery chain");
  await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
    backup: latest.label,
  });
  expect(await cluster.sql(target, "SELECT count(*) FROM payments")).toBe("1");
  await cluster.audit.write("expire", "PASSED", cluster.source);
  measurements.retention = {
    before: before.length,
    after: after.length,
    restored: true,
  };
});

test("concurrent backups serialize through repository locking and overlapping restore refuses a second writer", async () => {
  const backups = await Promise.allSettled([
    operations.backup(),
    operations.backup(),
  ]);
  expect(backups.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  expect(backups.filter((row) => row.status === "rejected")).toHaveLength(1);
  const latest = (await operations.info()).at(-1);
  if (!latest) throw new Error("No completed recovery chain");
  const target = await operations.newTarget("concurrent");
  const restore = () =>
    operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
      backup: latest.label,
    });
  const restores = await Promise.allSettled([restore(), restore()]);
  expect(restores.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  expect(restores.filter((row) => row.status === "rejected")).toHaveLength(1);
  expect(await cluster.sql(target, "SELECT count(*) FROM payments")).toBe("1");
  measurements.concurrency = { backupWriters: 1, restoreWriters: 1 };
});

test("automatic scheduler takes a real backup, emits completion and archive freshness stays inside RPO", async () => {
  const start = (await operations.info()).length;
  await docker([
    "exec",
    "-d",
    "-u",
    "postgres",
    cluster.source,
    "sh",
    "-ec",
    "echo $$ > /tmp/dr-scheduler.pid; exec dr-backup-loop > /tmp/dr-scheduler.log 2>&1",
  ]);
  let complete = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const output = await docker([
      "exec",
      cluster.source,
      "cat",
      "/tmp/dr-scheduler.log",
    ]);
    if (output.includes('"event":"backup_completed"')) {
      complete = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Stop the supervised test scheduler, never an unrelated process.
  await docker([
    "exec",
    cluster.source,
    "sh",
    "-ec",
    'kill -TERM "$(cat /tmp/dr-scheduler.pid)"',
  ]);
  expect(complete).toBe(true);
  expect((await operations.info()).length).toBe(start + 1);
  const health = await repositoryHealth(operations);
  expect(health.passed).toBe(true);
  measurements.scheduler = { completed: true, health };
});

test("upload and API deletion during an online backup reconcile against retained object versions", async () => {
  const backup = operations.backup();
  let active = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const probe = await run("docker", [
      "exec",
      cluster.source,
      "sh",
      "-ec",
      'find /tmp/pgbackrest -name "erp-backup-*.lock" | grep -q .',
    ]);
    if (probe.code === 0) {
      active = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(active).toBe(true);
  const input = storageInput(state.a);
  const captured = new Map([
    [
      state.objectKey,
      await readFile(
        resolve(
          cluster.directory,
          "private",
          "object-escrow",
          state.contentHash,
        ),
      ),
    ],
    [input.object.key, input.object.body],
  ]);
  await new AccountedObjectService(db, objects).store(input);
  const get = vi
    .spyOn(storageService, "get")
    .mockImplementation((key) => objects.get(key));
  const remove = vi
    .spyOn(storageService, "delete")
    .mockImplementation((key) => objects.delete(key));
  try {
    expect(
      (
        await request(
          "DELETE",
          `/api/attachments/${state.attachment.id}`,
          state.a.identity,
        )
      ).status,
    ).toBe(200);
  } finally {
    get.mockRestore();
    remove.mockRestore();
  }
  const completed = await backup;
  const target = await operations.newTarget("objects");
  await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
    backup: completed.label,
  });
  const restored = new PrismaClient({
    datasources: { db: { url: await cluster.connection(target) } },
  });
  const recoveredObjects = new LocalObjectStorage(
    resolve(cluster.directory, "private", "object-recovery"),
    true,
  );
  try {
    const references = await restored.attachment.findMany();
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      const body = captured.get(reference.storagePath);
      if (!body)
        throw new Error(
          "A restored DB reference has no retained object version.",
        );
      await recoveredObjects.put({
        key: reference.storagePath,
        body,
        contentType: reference.mimeType ?? "application/octet-stream",
      });
    }
    expect(
      (await inspectRestoredStorage(restored, recoveredObjects)).passed,
    ).toBe(true);
    expect((await checkInvariants(restored)).passed).toBe(true);
    measurements.onlineObjectBackup = {
      passed: true,
      references: references.length,
      retainedVersions: captured.size,
      originalDeletedViaApi: true,
    };
  } finally {
    await restored.$disconnect();
  }
});

test("scheduler cancellation during a real backup stops the active job and releases its locks", async () => {
  const before = (await operations.info()).map((row) => row.label);
  await docker([
    "exec",
    "-d",
    "-u",
    "postgres",
    cluster.source,
    "sh",
    "-ec",
    "echo $$ > /tmp/dr-cancelled-scheduler.pid; exec dr-backup-loop > /tmp/dr-cancelled-scheduler.log 2>&1",
  ]);
  let active = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const probe = await run("docker", [
      "exec",
      cluster.source,
      "sh",
      "-ec",
      'find /tmp/pgbackrest -name "erp-backup-*.lock" | grep -q .',
    ]);
    if (probe.code === 0) {
      active = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(active).toBe(true);
  await docker([
    "exec",
    cluster.source,
    "sh",
    "-ec",
    'kill -TERM "$(cat /tmp/dr-cancelled-scheduler.pid)"',
  ]);
  let stopped = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const output = await docker([
      "exec",
      cluster.source,
      "cat",
      "/tmp/dr-cancelled-scheduler.log",
    ]);
    if (output.includes('"event":"backup_scheduler_stopped"')) {
      stopped = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(stopped).toBe(true);
  expect((await operations.info()).map((row) => row.label)).toEqual(before);
  expect(await cluster.sql(cluster.source, "SELECT pg_is_in_recovery()")).toBe(
    "f",
  );
  await operations.backup(); // a live orphan would still hold the pgBackRest lock
  await operations.verify();
  measurements.schedulerCancellation = {
    duringRealBackup: true,
    stopped: true,
    subsequentBackupPassed: true,
  };
});

test("source crash does not prevent recovery from the independent read-only repository", async () => {
  const latest = (await operations.info()).at(-1);
  if (!latest) throw new Error("No complete backup for source-loss drill.");
  await cluster.assertOwned("container", cluster.source);
  await docker(["kill", "--signal=KILL", cluster.source]);
  const stopped = await docker([
    "inspect",
    "--format",
    "{{.State.Running}}",
    cluster.source,
  ]);
  expect(stopped).toBe("false");
  const started = performance.now();
  try {
    const target = await operations.newTarget("sourcelost");
    await operations.restore(target, `RESTORE ${target} FROM ${cluster.id}`, {
      backup: latest.label,
    });
    const restored = new PrismaClient({
      datasources: { db: { url: await cluster.connection(target) } },
    });
    try {
      expect(await restored.payment.count()).toBe(1);
      expect((await checkInvariants(restored)).passed).toBe(true);
      expect((await inspectRestoredStorage(restored, objects)).passed).toBe(
        true,
      );
      measurements.sourceCrash = {
        sourceUnavailableDuringRestore: true,
        physicalRestoreSeconds: (performance.now() - started) / 1000,
      };
    } finally {
      await restored.$disconnect();
    }
  } finally {
    await docker(["start", cluster.source]);
    await cluster.wait(cluster.source);
  }
});
